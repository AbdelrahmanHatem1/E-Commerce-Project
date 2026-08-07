import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNotification } from '../components/Notification.jsx';
import { readJson, writeJson } from '../lib/storage.js';

const WalletContext = createContext();

export const ORDER_HISTORY_KEY = 'shopstream_order_history';
export const WALLET_KEY = 'shopstream_wallet';
export const RETURNS_KEY = 'shopstream_returns';

/* Cash-back only lands once an order is actually delivered. */
export const CASHBACK_RATE = 0.03;

/* ----------------------------------------------------------------
   Return lifecycle.

   'requested'        — customer asked, waiting on a decision
   'approved'         — admin agreed, money not moved yet
   'rejected'         — admin refused, refund clawed back if paid
   'refunded'         — credited to the wallet
   'awaiting-courier' — approved, courier will hand over cash
   'paid-cash'        — courier delivered the cash, closed
   ---------------------------------------------------------------- */
export const RETURN_STATES = {
    requested: { label: 'Awaiting review', tone: 'wait' },
    approved: { label: 'Approved', tone: 'ok' },
    rejected: { label: 'Rejected', tone: 'bad' },
    refunded: { label: 'Refunded to wallet', tone: 'ok' },
    'awaiting-courier': { label: 'Awaiting courier', tone: 'wait' },
    'paid-cash': { label: 'Paid in cash', tone: 'ok' },
};

export const returnState = (entry) =>
    RETURN_STATES[entry?.status] ?? RETURN_STATES.requested;

/* Open requests still need an admin decision. */
export const isReturnOpen = (entry) =>
    entry?.status === 'requested' || entry?.status === 'awaiting-courier';

/* ----------------------------------------------------------------
   Order status.

   Normally derived from how long ago the order was placed, but a
   manual override (the simulate buttons) always wins so the flow can
   be demonstrated without waiting a week.
   ---------------------------------------------------------------- */
export const orderStatus = (order) => {
    if (order?.statusOverride === 'delivered') return { label: 'Delivered', tone: 'done' };
    if (order?.statusOverride === 'returned') return { label: 'Returned', tone: 'returned' };
    if (order?.statusOverride === 'shipped') return { label: 'Shipped', tone: 'ship' };

    const hours = (Date.now() - new Date(order?.placedAt).getTime()) / 3_600_000;
    if (hours >= 168) return { label: 'Delivered', tone: 'done' };
    if (hours >= 24) return { label: 'Shipped', tone: 'ship' };
    if (hours >= 2) return { label: 'Processing', tone: 'work' };
    return { label: 'Placed', tone: 'new' };
};

export const WalletProvider = ({ children }) => {
    const { notify } = useNotification();

    const [orders, setOrders] = useState(() => {
        const list = readJson(ORDER_HISTORY_KEY, []);
        return Array.isArray(list) ? list : [];
    });

    /* Manual adjustments: refunds in, checkout spending out. Cash-back is
       computed from orders instead of stored, so the two can never drift. */
    const [ledger, setLedger] = useState(() => {
        const saved = readJson(WALLET_KEY, []);
        return Array.isArray(saved) ? saved : [];
    });

    const [returns, setReturns] = useState(() => {
        const saved = readJson(RETURNS_KEY, []);
        return Array.isArray(saved) ? saved : [];
    });

    /* Stay in sync with other tabs. */
    useEffect(() => {
        const sync = (event) => {
            if (event.key === ORDER_HISTORY_KEY) setOrders(readJson(ORDER_HISTORY_KEY, []));
            if (event.key === WALLET_KEY) setLedger(readJson(WALLET_KEY, []));
            if (event.key === RETURNS_KEY) setReturns(readJson(RETURNS_KEY, []));
        };

        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);

    const persistOrders = useCallback((next) => {
        setOrders(next);
        writeJson(ORDER_HISTORY_KEY, next);
    }, []);

    const persistLedger = useCallback((next) => {
        setLedger(next);
        writeJson(WALLET_KEY, next);
    }, []);

    const persistReturns = useCallback((next) => {
        setReturns(next);
        writeJson(RETURNS_KEY, next);
    }, []);

    /* --------------------------- balance --------------------------- */
    const cashback = useMemo(
        () =>
            orders
                .filter((order) => orderStatus(order).tone === 'done')
                .reduce((sum, order) => sum + (order.totals?.total ?? 0) * CASHBACK_RATE, 0),
        [orders]
    );

    const adjustments = useMemo(
        () => ledger.reduce((sum, entry) => sum + entry.amount, 0),
        [ledger]
    );

    const balance = Math.max(0, cashback + adjustments);

    /* Newest first, cash-back folded in as read-only rows. */
    const transactions = useMemo(() => {
        const earned = orders
            .filter((order) => orderStatus(order).tone === 'done')
            .map((order) => ({
                id: `cb-${order.orderNumber}`,
                label: `Cash-back · ${order.orderNumber}`,
                amount: (order.totals?.total ?? 0) * CASHBACK_RATE,
                at: order.placedAt,
                kind: 'cashback',
            }));

        return [...earned, ...ledger].sort((a, b) => new Date(b.at) - new Date(a.at));
    }, [orders, ledger]);

    const addFunds = useCallback(
        (amount, label, kind = 'refund') => {
            if (!amount) return;
            persistLedger([
                { id: `w-${Date.now()}`, label, amount, at: new Date().toISOString(), kind },
                ...ledger,
            ]);
        },
        [ledger, persistLedger]
    );

    const spendFunds = useCallback(
        (amount, label) => {
            if (amount <= 0) return false;
            if (amount > balance + 0.001) return false;

            persistLedger([
                { id: `w-${Date.now()}`, label, amount: -amount, at: new Date().toISOString(), kind: 'spend' },
                ...ledger,
            ]);
            return true;
        },
        [balance, ledger, persistLedger]
    );

    /* ---------------------- order simulation ----------------------- */
    const setOrderStage = useCallback(
        (orderNumber, stage) => {
            const next = orders.map((order) =>
                order.orderNumber === orderNumber ? { ...order, statusOverride: stage } : order
            );
            persistOrders(next);

            notify.success(
                stage === 'delivered'
                    ? `${orderNumber} marked as delivered — cash-back credited.`
                    : `${orderNumber} moved to ${stage}.`
            );
        },
        [orders, persistOrders, notify]
    );

    /* -------------------------- returns ---------------------------- */
    const isReturnable = useCallback(
        (order) => {
            if (orderStatus(order).tone !== 'done') return false;

            const days = (Date.now() - new Date(order.placedAt).getTime()) / 86_400_000;
            if (days > 30) return false;

            /* Nothing left once every line has been sent back. A rejected
               request frees its items again; a pending one still blocks
               them, otherwise the same item could be requested twice while
               the first request is under review. */
            const already = returns
                .filter(
                    (entry) => entry.orderNumber === order.orderNumber && entry.status !== 'rejected'
                )
                .flatMap((entry) => entry.items);

            return order.items?.some((item) => {
                const sent = already
                    .filter((line) => line.id === item.id)
                    .reduce((sum, line) => sum + line.quantity, 0);
                return sent < item.quantity;
            });
        },
        [returns]
    );

    const returnedQtyFor = useCallback(
        (orderNumber, itemId) =>
            returns
                .filter((entry) => entry.orderNumber === orderNumber && entry.status !== 'rejected')
                .flatMap((entry) => entry.items)
                .filter((line) => line.id === itemId)
                .reduce((sum, line) => sum + line.quantity, 0),
        [returns]
    );

    /* ----------------------------------------------------------------
       A request is only ever a request. No money moves and the order is
       not marked returned until an admin approves it — previously the
       wallet was credited the instant the customer clicked, which meant
       a refund could never be refused.
       ---------------------------------------------------------------- */
    const requestReturn = useCallback(
        ({ orderNumber, items, reason, payout, note }) => {
            const amount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

            const record = {
                id: `RET-${Date.now().toString().slice(-6)}`,
                orderNumber,
                items,
                reason,
                payout,
                note: note || '',
                amount,
                status: 'requested',
                at: new Date().toISOString(),
            };

            persistReturns([record, ...returns]);
            notify.success(
                `Return ${record.id} submitted.`,
                'Our team reviews requests within one business day.'
            );

            return record;
        },
        [returns, persistReturns, notify]
    );

    /* --------------------- admin decisions ------------------------- */

    const approveReturn = useCallback(
        (id, adminNote = '') => {
            const entry = returns.find((row) => row.id === id);
            if (!entry || entry.status !== 'requested') return false;

            /* Wallet payouts settle immediately; cash payouts wait for the
               courier to actually hand the money over. */
            const nextStatus = entry.payout === 'wallet' ? 'refunded' : 'awaiting-courier';

            persistReturns(
                returns.map((row) =>
                    row.id === id
                        ? {
                            ...row,
                            status: nextStatus,
                            adminNote,
                            decidedAt: new Date().toISOString(),
                        }
                        : row
                )
            );

            if (entry.payout === 'wallet') {
                addFunds(entry.amount, `Refund · ${entry.orderNumber}`, 'refund');
            }

            /* Only now can the order be considered returned, and only if
               every line has actually gone back across all approved
               requests — a partial return must leave the order delivered. */
            const order = orders.find((row) => row.orderNumber === entry.orderNumber);

            if (order) {
                const settled = returns
                    .filter(
                        (row) =>
                            row.orderNumber === entry.orderNumber &&
                            (row.id === id || ['approved', 'refunded', 'awaiting-courier', 'paid-cash'].includes(row.status))
                    )
                    .flatMap((row) => row.items);

                const allBack = order.items.every((item) => {
                    const sent = settled
                        .filter((line) => line.id === item.id)
                        .reduce((sum, line) => sum + line.quantity, 0);
                    return sent >= item.quantity;
                });

                if (allBack) {
                    persistOrders(
                        orders.map((row) =>
                            row.orderNumber === entry.orderNumber
                                ? { ...row, statusOverride: 'returned' }
                                : row
                        )
                    );
                }
            }

            notify.success(
                `${id} approved.`,
                entry.payout === 'wallet'
                    ? `${entry.amount.toFixed(2)} credited to the customer wallet.`
                    : 'Courier will collect the item and hand over the cash.'
            );

            return true;
        },
        [returns, orders, persistReturns, persistOrders, addFunds, notify]
    );

    const rejectReturn = useCallback(
        (id, adminNote = '') => {
            const entry = returns.find((row) => row.id === id);
            /* Rejecting a closed request is a no-op, not a second reversal. */
            if (!entry || ['rejected', 'paid-cash'].includes(entry.status)) return false;

            /* Guard: rejecting something already paid out has to claw the
               money back, otherwise the wallet keeps a refund for goods the
               store never took back. */
            const alreadyPaid = entry.status === 'refunded';

            persistReturns(
                returns.map((row) =>
                    row.id === id
                        ? { ...row, status: 'rejected', adminNote, decidedAt: new Date().toISOString() }
                        : row
                )
            );

            if (alreadyPaid) {
                addFunds(-entry.amount, `Refund reversed · ${entry.orderNumber}`, 'reversal');
            }

            /* An order marked returned because of this request must go back
               to delivered. */
            const order = orders.find((row) => row.orderNumber === entry.orderNumber);
            if (order?.statusOverride === 'returned') {
                persistOrders(
                    orders.map((row) =>
                        row.orderNumber === entry.orderNumber
                            ? { ...row, statusOverride: 'delivered' }
                            : row
                    )
                );
            }

            notify.warning(`${id} rejected.${alreadyPaid ? ' The refund was reversed.' : ''}`);
            return true;
        },
        [returns, orders, persistReturns, persistOrders, addFunds, notify]
    );

    /* Courier handed the cash over — closes a cash payout. This is an
       admin/courier action: the customer confirming their own payout was
       never a real control. */
    const confirmCourierPayout = useCallback(
        (id) => {
            const entry = returns.find((row) => row.id === id);
            if (!entry || entry.status !== 'awaiting-courier') return false;

            persistReturns(
                returns.map((row) =>
                    row.id === id
                        ? { ...row, status: 'paid-cash', settledAt: new Date().toISOString() }
                        : row
                )
            );

            notify.success('Cash payout confirmed.', 'Nothing was added to the wallet.');
            return true;
        },
        [returns, persistReturns, notify]
    );

    const refreshOrders = useCallback(() => {
        setOrders(readJson(ORDER_HISTORY_KEY, []));
    }, []);

    /* Orders still moving through the pipeline. A delivered or returned
       order is finished business, so it must not keep the navbar badge
       lit — the badge means "something needs your attention". */
    const activeOrderCount = useMemo(
        () =>
            orders.filter((order) => {
                const tone = orderStatus(order).tone;
                return tone !== 'done' && tone !== 'returned';
            }).length,
        [orders]
    );

    const value = useMemo(
        () => ({
            orders,
            orderCount: orders.length,
            activeOrderCount,
            refreshOrders,
            persistOrders,
            balance,
            cashback,
            transactions,
            addFunds,
            spendFunds,
            setOrderStage,
            returns,
            isReturnable,
            returnedQtyFor,
            requestReturn,
            approveReturn,
            rejectReturn,
            confirmCourierPayout,
        }),
        [
            orders,
            activeOrderCount,
            refreshOrders,
            persistOrders,
            balance,
            cashback,
            transactions,
            addFunds,
            spendFunds,
            setOrderStage,
            returns,
            isReturnable,
            returnedQtyFor,
            requestReturn,
            approveReturn,
            rejectReturn,
            confirmCourierPayout,
        ]
    );

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = () => {
    const context = useContext(WalletContext);

    if (!context) {
        throw new Error('useWallet must be used inside <WalletProvider>.');
    }

    return context;
};

export default WalletContext;
