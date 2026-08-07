import React, { useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link, useSearchParams } from 'react-router-dom';
import { useWallet, orderStatus, returnState } from '../contexts/WalletContext.jsx';
import { useCurrency } from '../contexts/CurrencyContext.jsx';
import { useNotification } from '../components/Notification.jsx';
import './ReturnsPage.css';

const REASONS = [
    { id: 'damaged', label: 'Arrived damaged', icon: 'bi-exclamation-triangle' },
    { id: 'wrong', label: 'Wrong item sent', icon: 'bi-box-seam' },
    { id: 'not-described', label: 'Not as described', icon: 'bi-file-text' },
    { id: 'size', label: 'Size or fit issue', icon: 'bi-rulers' },
    { id: 'changed-mind', label: 'Changed my mind', icon: 'bi-arrow-counterclockwise' },
];

const formatDate = (value) =>
    new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const daysLeft = (placedAt) =>
    Math.max(0, 30 - Math.floor((Date.now() - new Date(placedAt).getTime()) / 86_400_000));

const ReturnsPage = () => {
    const {
        orders,
        returns,
        isReturnable,
        returnedQtyFor,
        requestReturn,
    } = useWallet();

    const { format } = useCurrency();
    const { notify } = useNotification();
    const [searchParams, setSearchParams] = useSearchParams();

    const preselected = searchParams.get('order') || '';

    const [selectedOrder, setSelectedOrder] = useState(preselected);
    const [picked, setPicked] = useState({});
    const [reason, setReason] = useState('damaged');
    const [payout, setPayout] = useState('wallet');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        document.title = 'Returns · ShopStream';
        return () => {
            document.title = 'ShopStream';
        };
    }, []);

    const eligible = useMemo(() => orders.filter(isReturnable), [orders, isReturnable]);

    const order = useMemo(
        () => eligible.find((entry) => entry.orderNumber === selectedOrder),
        [eligible, selectedOrder]
    );

    /* Reset the picks whenever a different order is chosen. */
    useEffect(() => {
        setPicked({});
    }, [selectedOrder]);

    const lines = useMemo(() => {
        if (!order) return [];

        return order.items
            .map((item) => {
                const sent = returnedQtyFor(order.orderNumber, item.id);
                return { ...item, remaining: item.quantity - sent };
            })
            .filter((item) => item.remaining > 0);
    }, [order, returnedQtyFor]);

    const refundTotal = useMemo(
        () =>
            lines.reduce((sum, item) => sum + item.price * (picked[item.id] ?? 0), 0),
        [lines, picked]
    );

    const pickedCount = Object.values(picked).reduce((sum, qty) => sum + qty, 0);

    const setQty = (itemId, qty, max) => {
        setPicked((prev) => {
            const next = { ...prev };
            const value = Math.max(0, Math.min(qty, max));
            if (value === 0) delete next[itemId];
            else next[itemId] = value;
            return next;
        });
    };

    const chooseOrder = (orderNumber) => {
        setSelectedOrder(orderNumber);
        const next = new URLSearchParams(searchParams);
        if (orderNumber) next.set('order', orderNumber);
        else next.delete('order');
        setSearchParams(next, { replace: true });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!order) {
            notify.error('No order selected', 'Choose the order you want to return from.');
            return;
        }

        if (pickedCount === 0) {
            notify.error('Nothing selected', 'Pick at least one item to send back.');
            return;
        }

        setSubmitting(true);
        await new Promise((resolve) => setTimeout(resolve, 700));

        const items = lines
            .filter((item) => picked[item.id])
            .map((item) => ({
                id: item.id,
                title: item.title,
                price: item.price,
                quantity: picked[item.id],
                thumbnail: item.thumbnail,
            }));

        requestReturn({ orderNumber: order.orderNumber, items, reason, payout, note });

        setSubmitting(false);
        setPicked({});
        setNote('');
        chooseOrder('');
    };

    return (
        <main className="rt-page">
            <div className="rt-shell">
                <nav className="rt-breadcrumb" aria-label="Breadcrumb">
                    <Link to="/">Home</Link>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                    <Link to="/profile">Account</Link>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                    <span>Returns</span>
                </nav>

                <header className="rt-header">
                    <div>
                        <h1>Return an item</h1>
                        <p>Delivered orders can be returned within 30 days. Refunds are instant.</p>
                    </div>

                    <Link to="/support#returns" className="rt-policy-link">
                        <i className="bi bi-info-circle" aria-hidden="true" />
                        Return policy
                    </Link>
                </header>

                <div className="rt-layout">
                    {/* ----------------------------- form ---------------------------- */}
                    <section className="rt-main">
                        {eligible.length === 0 ? (
                            <div className="rt-empty">
                                <i className="bi bi-box-seam" aria-hidden="true" />
                                <h2>No orders are eligible right now</h2>
                                <p>
                                    Only delivered orders from the last 30 days can be returned. Mark an order as
                                    delivered from your account to try this flow.
                                </p>
                                <Link to="/orders">Go to order history</Link>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} noValidate>
                                {/* step 1 */}
                                <div className="rt-step">
                                    <span className="rt-step-num">1</span>
                                    <div className="rt-step-body">
                                        <h2>Choose the order</h2>

                                        <div className="rt-order-picker">
                                            {eligible.map((entry) => {
                                                const active = entry.orderNumber === selectedOrder;

                                                return (
                                                    <button
                                                        type="button"
                                                        key={entry.orderNumber}
                                                        className={`rt-order-option ${active ? 'is-active' : ''}`}
                                                        onClick={() => chooseOrder(entry.orderNumber)}
                                                    >
                                                        <span className="rt-order-thumbs">
                                                            {entry.items.slice(0, 3).map((item) => (
                                                                <span key={item.id}>
                                                                    {item.thumbnail ? (
                                                                        <img src={item.thumbnail} alt="" loading="lazy" />
                                                                    ) : (
                                                                        <i className="bi bi-image" aria-hidden="true" />
                                                                    )}
                                                                </span>
                                                            ))}
                                                        </span>

                                                        <span className="rt-order-meta">
                                                            <strong>{entry.orderNumber}</strong>
                                                            <small>
                                                                {formatDate(entry.placedAt)} · {daysLeft(entry.placedAt)} days left
                                                            </small>
                                                        </span>

                                                        <strong className="rt-order-total">
                                                            {format(entry.totals?.total ?? 0)}
                                                        </strong>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* step 2 */}
                                <div className={`rt-step ${!order ? 'is-locked' : ''}`}>
                                    <span className="rt-step-num">2</span>
                                    <div className="rt-step-body">
                                        <h2>Select the items</h2>

                                        {!order ? (
                                            <p className="rt-hint">Pick an order above to see its items.</p>
                                        ) : (
                                            <ul className="rt-item-list">
                                                {lines.map((item) => (
                                                    <li className={picked[item.id] ? 'is-picked' : ''} key={item.id}>
                                                        <label className="rt-item-check">
                                                            <input
                                                                type="checkbox"
                                                                checked={Boolean(picked[item.id])}
                                                                onChange={(event) =>
                                                                    setQty(item.id, event.target.checked ? 1 : 0, item.remaining)
                                                                }
                                                            />
                                                            <span className="rt-checkbox" aria-hidden="true">
                                                                <i className="bi bi-check2" />
                                                            </span>
                                                        </label>

                                                        <span className="rt-item-thumb">
                                                            {item.thumbnail ? (
                                                                <img src={item.thumbnail} alt="" loading="lazy" />
                                                            ) : (
                                                                <i className="bi bi-image" aria-hidden="true" />
                                                            )}
                                                        </span>

                                                        <span className="rt-item-info">
                                                            <strong>{item.title}</strong>
                                                            <small>
                                                                {format(item.price)} · {item.remaining} eligible
                                                                {item.selectedColor && ` · ${item.selectedColor}`}
                                                            </small>
                                                        </span>

                                                        {picked[item.id] ? (
                                                            <span className="rt-qty">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setQty(item.id, picked[item.id] - 1, item.remaining)}
                                                                    aria-label="Decrease"
                                                                >
                                                                    <i className="bi bi-dash" aria-hidden="true" />
                                                                </button>
                                                                <span>{picked[item.id]}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setQty(item.id, picked[item.id] + 1, item.remaining)}
                                                                    disabled={picked[item.id] >= item.remaining}
                                                                    aria-label="Increase"
                                                                >
                                                                    <i className="bi bi-plus" aria-hidden="true" />
                                                                </button>
                                                            </span>
                                                        ) : (
                                                            <span className="rt-item-price">{format(item.price)}</span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>

                                {/* step 3 */}
                                <div className={`rt-step ${pickedCount === 0 ? 'is-locked' : ''}`}>
                                    <span className="rt-step-num">3</span>
                                    <div className="rt-step-body">
                                        <h2>Tell us why</h2>

                                        <div className="rt-reasons">
                                            {REASONS.map((entry) => (
                                                <button
                                                    type="button"
                                                    key={entry.id}
                                                    className={`rt-reason ${reason === entry.id ? 'is-active' : ''}`}
                                                    onClick={() => setReason(entry.id)}
                                                >
                                                    <i className={`bi ${entry.icon}`} aria-hidden="true" />
                                                    {entry.label}
                                                </button>
                                            ))}
                                        </div>

                                        <textarea
                                            className="rt-note"
                                            rows={3}
                                            value={note}
                                            onChange={(event) => setNote(event.target.value)}
                                            placeholder="Anything else we should know? (optional)"
                                            aria-label="Additional notes"
                                        />
                                    </div>
                                </div>

                                {/* step 4 */}
                                <div className={`rt-step ${pickedCount === 0 ? 'is-locked' : ''}`}>
                                    <span className="rt-step-num">4</span>
                                    <div className="rt-step-body">
                                        <h2>How should we refund you?</h2>

                                        <div className="rt-payouts">
                                            <button
                                                type="button"
                                                className={`rt-payout ${payout === 'wallet' ? 'is-active' : ''}`}
                                                onClick={() => setPayout('wallet')}
                                            >
                                                <span className="rt-payout-icon is-wallet" aria-hidden="true">
                                                    <i className="bi bi-wallet2" />
                                                </span>
                                                <span>
                                                    <strong>Store credit</strong>
                                                    <small>Added to your wallet instantly. Spend it at checkout.</small>
                                                </span>
                                                <i
                                                    className={`bi ${payout === 'wallet' ? 'bi-check-circle-fill' : 'bi-circle'} rt-payout-mark`}
                                                    aria-hidden="true"
                                                />
                                            </button>

                                            <button
                                                type="button"
                                                className={`rt-payout ${payout === 'courier' ? 'is-active' : ''}`}
                                                onClick={() => setPayout('courier')}
                                            >
                                                <span className="rt-payout-icon is-cash" aria-hidden="true">
                                                    <i className="bi bi-cash-coin" />
                                                </span>
                                                <span>
                                                    <strong>Cash from the courier</strong>
                                                    <small>
                                                        Paid in hand when the item is collected. Nothing is added to your
                                                        wallet.
                                                    </small>
                                                </span>
                                                <i
                                                    className={`bi ${payout === 'courier' ? 'bi-check-circle-fill' : 'bi-circle'} rt-payout-mark`}
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="rt-submit-row">
                                    <div className="rt-total">
                                        <span>Refund amount</span>
                                        <strong>{format(refundTotal)}</strong>
                                    </div>

                                    <button type="submit" className="rt-submit" disabled={pickedCount === 0 || submitting}>
                                        {submitting ? (
                                            <>
                                                <span className="rt-spinner" aria-hidden="true" />
                                                Submitting…
                                            </>
                                        ) : (
                                            <>
                                                <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                                                Request return
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        )}
                    </section>

                    {/* --------------------------- history --------------------------- */}
                    <aside className="rt-history" aria-label="Return requests">
                        <h2>
                            <i className="bi bi-clock-history" aria-hidden="true" />
                            Your returns
                        </h2>

                        {returns.length === 0 ? (
                            <p className="rt-history-empty">No returns requested yet.</p>
                        ) : (
                            <ul className="rt-history-list">
                                {returns.map((entry) => (
                                    <li className={`rt-history-item is-${entry.status}`} key={entry.id}>
                                        <div className="rt-history-head">
                                            <strong>{entry.id}</strong>
                                            <span className={`rt-history-status is-${entry.status}`}>
                                                {returnState(entry).label}
                                            </span>
                                        </div>

                                        <p className="rt-history-items">
                                            {entry.items.map((item) => `${item.quantity}× ${item.title}`).join(', ')}
                                        </p>

                                        <div className="rt-history-foot">
                                            <span>
                                                {entry.orderNumber} · {formatDate(entry.at)}
                                            </span>
                                            <strong>{format(entry.amount)}</strong>
                                        </div>

                                        {entry.status === 'requested' && (
                                            <p className="rt-history-note is-wait">
                                                <i className="bi bi-hourglass-split" aria-hidden="true" />
                                                Under review — we usually decide within one business day.
                                            </p>
                                        )}

                                        {entry.status === 'awaiting-courier' && (
                                            <p className="rt-history-note is-wait">
                                                <i className="bi bi-truck" aria-hidden="true" />
                                                Approved. Our courier brings the cash when collecting the item.
                                            </p>
                                        )}

                                        {entry.status === 'rejected' && (
                                            <p className="rt-history-note is-bad">
                                                <i className="bi bi-x-circle" aria-hidden="true" />
                                                {entry.adminNote || 'This request was not approved.'}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </aside>
                </div>
            </div>
        </main>
    );
};

export default ReturnsPage;
