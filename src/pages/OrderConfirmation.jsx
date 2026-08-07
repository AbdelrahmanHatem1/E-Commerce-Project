import React, { useContext, useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext.jsx';
import { useNotification } from '../components/Notification.jsx';
import './OrderConfirmation.css';

const API = 'https://dummyjson.com';
const SUPPORT_EMAIL = 'support@shopstream.com';

/* Written by CheckoutPage right before it redirects here. */
export const LAST_ORDER_KEY = 'shopstream_last_order';
export const ORDER_HISTORY_KEY = 'shopstream_order_history';

const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
});

/* ----------------------------------------------------------------
   Date helpers — "Tuesday, October 24th, 2024"
   ---------------------------------------------------------------- */
const ordinal = (day) => {
    if (day > 3 && day < 21) return 'th';
    return ['th', 'st', 'nd', 'rd'][day % 10] || 'th';
};

const formatLongDate = (date) => {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    return `${weekday}, ${month} ${date.getDate()}${ordinal(date.getDate())}, ${date.getFullYear()}`;
};

const formatShortTime = (date) =>
    date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

/* Turn the DummyJSON `shippingInformation` string into a real number
   of days, then into a delivery window. */
const parseShippingDays = (text) => {
    if (!text) return 4;

    const numbers = text.match(/\d+/g)?.map(Number) ?? [];
    const largest = numbers.length ? Math.max(...numbers) : 0;

    if (/month/i.test(text)) return (largest || 1) * 30;
    if (/week/i.test(text)) return (largest || 1) * 7;
    if (/overnight|next day|1 day/i.test(text)) return 1;

    return largest || 4;
};

const addBusinessDays = (start, days) => {
    const date = new Date(start);
    let added = 0;

    while (added < days) {
        date.setDate(date.getDate() + 1);
        const weekday = date.getDay();
        if (weekday !== 0 && weekday !== 6) added += 1;
    }

    return date;
};

/* ----------------------------------------------------------------
   Delivery tracker — the stage is derived from how long ago the
   order was actually placed, so it moves on its own over time.
   ---------------------------------------------------------------- */
const TRACKER_STAGES = [
    { id: 'placed', label: 'Placed', icon: 'bi-check-lg', afterHours: 0 },
    { id: 'processing', label: 'Processing', icon: 'bi-box-seam', afterHours: 2 },
    { id: 'shipped', label: 'Shipped', icon: 'bi-truck', afterHours: 24 },
];

const DeliveryTracker = ({ placedAt }) => {
    const [now, setNow] = useState(() => Date.now());

    /* Re-evaluate every minute so the tracker advances live. */
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(timer);
    }, []);

    const placedTime = new Date(placedAt).getTime();
    const hoursElapsed = (now - placedTime) / 3_600_000;

    return (
        <ol className="oc-tracker" aria-label="Order progress">
            {TRACKER_STAGES.map((stage, index) => {
                const reached = hoursElapsed >= stage.afterHours;
                const nextStage = TRACKER_STAGES[index + 1];
                const isCurrent = reached && (!nextStage || hoursElapsed < nextStage.afterHours);
                const state = isCurrent ? 'current' : reached ? 'done' : 'idle';
                const stageTime = new Date(placedTime + stage.afterHours * 3_600_000);

                return (
                    <li className={`oc-tracker-step is-${state}`} key={stage.id}>
                        {index > 0 && (
                            <span
                                className={`oc-tracker-line ${reached ? 'is-filled' : ''}`}
                                aria-hidden="true"
                            />
                        )}

                        <span className="oc-tracker-bullet" aria-hidden="true">
                            <i className={`bi ${stage.icon}`} />
                        </span>

                        <span className="oc-tracker-label">{stage.label}</span>
                        <span className="oc-tracker-time">
                            {reached ? formatShortTime(stageTime) : `Est. ${formatShortTime(stageTime)}`}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
};

/* ----------------------------------------------------------------
   Order history drawer — merges orders placed in this app with the
   user's past carts from DummyJSON.
   ---------------------------------------------------------------- */
const OrderHistory = ({ open, onClose, userId, currentOrderNumber }) => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!open || loaded) return;

        let cancelled = false;

        const load = async () => {
            setLoading(true);

            /* 1) Orders this browser actually placed. */
            let local = [];
            try {
                local = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || '[]');
            } catch (error) {
                console.error('Failed to read the local order history:', error);
            }

            const localRows = (Array.isArray(local) ? local : []).map((entry) => ({
                key: entry.orderNumber,
                reference: entry.orderNumber,
                date: entry.placedAt,
                itemCount: entry.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
                total: entry.totals?.total ?? 0,
                source: 'local',
            }));

            /* 2) Historic carts from DummyJSON for the same user. */
            let remoteRows = [];
            try {
                const { data } = await axios.get(`${API}/carts/user/${userId ?? 1}`);

                remoteRows = (data.carts || []).map((cart) => ({
                    key: `dj-${cart.id}`,
                    reference: `SS-${String(cart.id).padStart(5, '0')}`,
                    date: null,
                    itemCount: cart.totalQuantity,
                    total: cart.discountedTotal ?? cart.total,
                    source: 'archive',
                }));
            } catch (error) {
                console.error('Failed to load past orders:', error);
            }

            if (cancelled) return;

            const seen = new Set();
            const merged = [...localRows, ...remoteRows].filter((row) => {
                if (seen.has(row.reference)) return false;
                seen.add(row.reference);
                return true;
            });

            setOrders(merged);
            setLoading(false);
            setLoaded(true);
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [open, loaded, userId]);

    if (!open) return null;

    return (
        <section className="oc-history" aria-label="Order history">
            <div className="oc-history-head">
                <h2>
                    <i className="bi bi-clock-history" aria-hidden="true" />
                    Order History
                </h2>
                <button type="button" onClick={onClose} aria-label="Close order history">
                    <i className="bi bi-x-lg" aria-hidden="true" />
                </button>
            </div>

            {loading && <p className="oc-history-state">Loading your orders…</p>}

            {!loading && orders.length === 0 && (
                <p className="oc-history-state">You have no previous orders yet.</p>
            )}

            {!loading && orders.length > 0 && (
                <ul className="oc-history-list">
                    {orders.map((order) => (
                        <li
                            className={`oc-history-row ${order.reference === currentOrderNumber ? 'is-current' : ''
                                }`}
                            key={order.key}
                        >
                            <div>
                                <strong>{order.reference}</strong>
                                <span>
                                    {order.date ? formatShortTime(new Date(order.date)) : 'Archived order'} ·{' '}
                                    {order.itemCount} item(s)
                                </span>
                            </div>

                            <div className="oc-history-right">
                                <strong>{money.format(order.total)}</strong>
                                {order.reference === currentOrderNumber && (
                                    <span className="oc-history-badge">This order</span>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

/* ----------------------------------------------------------------
   Order confirmation page
   ---------------------------------------------------------------- */
const OrderConfirmation = () => {
    const { user } = useContext(AuthContext);
    const { notify } = useNotification();
    const navigate = useNavigate();

    const [order, setOrder] = useState(null);
    const [checked, setChecked] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    /* Read the order the checkout page stored, then guard the route. */
    useEffect(() => {
        let parsed = null;

        try {
            const raw = sessionStorage.getItem(LAST_ORDER_KEY);
            if (raw) parsed = JSON.parse(raw);
        } catch (error) {
            console.error('Failed to read the placed order:', error);
        }

        if (!parsed || !parsed.orderNumber) {
            notify.info('There is no recent order to display.');
            navigate('/', { replace: true });
            setChecked(true);
            return;
        }

        setOrder(parsed);
        setChecked(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ----------------------------- derived ----------------------------- */
    const delivery = useMemo(() => {
        if (!order) return null;

        const placed = new Date(order.placedAt);
        const days = parseShippingDays(order.shippingInformation);
        const eta = addBusinessDays(placed, days);

        const method =
            days <= 2
                ? 'Express Delivery (1-2 Business Days)'
                : days <= 5
                    ? 'Express Delivery (3-5 Business Days)'
                    : days <= 14
                        ? 'Standard Delivery (1-2 Weeks)'
                        : 'Scheduled Delivery';

        return { eta, method, days };
    }, [order]);

    const itemCount = useMemo(
        () => order?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
        [order]
    );

    /* ----------------------------- actions ----------------------------- */
    const copyReference = async () => {
        try {
            await navigator.clipboard.writeText(order.orderNumber);
            notify.success('Order number copied to your clipboard.');
        } catch (error) {
            console.error('Clipboard is unavailable:', error);
            notify.info(`Your order reference is ${order.orderNumber}.`);
        }
    };

    const contactSupport = () => {
        const subject = encodeURIComponent(`Help with order ${order.orderNumber}`);
        const body = encodeURIComponent(
            `Hello ShopStream team,\n\nI need help with order ${order.orderNumber} placed on ` +
            `${formatShortTime(new Date(order.placedAt))}.\n\n`
        );

        window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
        notify.info('Opening your email app with the order reference attached.');
    };

    const printReceipt = () => window.print();

    if (!checked || !order) return null;

    const { shipping, totals } = order;

    return (
        <main className="oc-page">
            <div className="oc-shell">
                {/* ----------------------------- hero ----------------------------- */}
                <header className="oc-hero">
                    <span className="oc-hero-check" aria-hidden="true">
                        <i className="bi bi-check-lg" />
                    </span>

                    <h1>Order {order.orderNumber} Confirmed</h1>

                    <p>
                        Woohoo! Your order has been placed successfully. We&apos;ve sent a confirmation email to{' '}
                        <a href={`mailto:${shipping.email}`}>{shipping.email}</a>.
                    </p>

                    <div className="oc-hero-actions">
                        <button type="button" className="oc-ghost-chip" onClick={copyReference}>
                            <i className="bi bi-clipboard" aria-hidden="true" />
                            Copy order number
                        </button>

                        <button type="button" className="oc-ghost-chip" onClick={printReceipt}>
                            <i className="bi bi-printer" aria-hidden="true" />
                            Print receipt
                        </button>
                    </div>
                </header>

                <div className="oc-layout">
                    {/* ------------------------ delivery card ------------------------ */}
                    <section className="oc-card" aria-labelledby="delivery-heading">
                        <div className="oc-card-head">
                            <div>
                                <h2 id="delivery-heading">Estimated Delivery</h2>
                                <p className="oc-delivery-date">{formatLongDate(delivery.eta)}</p>
                            </div>
                            <i className="bi bi-truck oc-card-icon" aria-hidden="true" />
                        </div>

                        <DeliveryTracker placedAt={order.placedAt} />

                        <div className="oc-detail-grid">
                            <div className="oc-detail">
                                <h3>Shipping Address</h3>
                                <address>
                                    {shipping.firstName} {shipping.lastName}
                                    <br />
                                    {shipping.address}
                                    <br />
                                    {shipping.city}, {shipping.state} {shipping.zipCode}
                                    <br />
                                    {shipping.country}
                                    {shipping.phone && (
                                        <>
                                            <br />
                                            {shipping.phone}
                                        </>
                                    )}
                                </address>
                            </div>

                            <div className="oc-detail">
                                <h3>Shipping Method</h3>
                                <p>{delivery.method}</p>

                                {order.shippingInformation && (
                                    <p className="oc-detail-muted">
                                        <i className="bi bi-box-seam" aria-hidden="true" />
                                        {order.shippingInformation}
                                    </p>
                                )}

                                {order.returnPolicy && (
                                    <p className="oc-detail-muted">
                                        <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                                        {order.returnPolicy}
                                    </p>
                                )}

                                <p className="oc-detail-muted">
                                    <i className="bi bi-credit-card" aria-hidden="true" />
                                    {order.payment?.method === 'paypal'
                                        ? 'Paid with PayPal'
                                        : `Card ending in ${order.payment?.last4 ?? '••••'}`}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* ------------------------ summary card ------------------------- */}
                    <aside className="oc-summary" aria-label="Order summary">
                        <h2>Order Summary</h2>

                        <ul className="oc-summary-items">
                            {order.items.map((item) => (
                                <li className="oc-summary-item" key={item.id}>
                                    <div className="oc-summary-thumb">
                                        {item.thumbnail ? (
                                            <img src={item.thumbnail} alt={item.title} />
                                        ) : (
                                            <i className="bi bi-image" aria-hidden="true" />
                                        )}
                                    </div>

                                    <div className="oc-summary-info">
                                        <h3 title={item.title}>{item.title}</h3>
                                        <span>
                                            Qty: {item.quantity}
                                            {item.selectedColor && ` · ${item.selectedColor}`}
                                        </span>
                                    </div>

                                    <strong>{money.format(item.price * item.quantity)}</strong>
                                </li>
                            ))}
                        </ul>

                        <dl className="oc-summary-breakdown">
                            <div>
                                <dt>Subtotal</dt>
                                <dd>{money.format(totals.subtotal)}</dd>
                            </div>

                            {totals.discount > 0 && (
                                <div>
                                    <dt>Discount{order.promo ? ` (${order.promo.code})` : ''}</dt>
                                    <dd className="oc-discount">-{money.format(totals.discount)}</dd>
                                </div>
                            )}

                            <div>
                                <dt>Shipping</dt>
                                <dd className="oc-free">
                                    {totals.shipping === 0 ? 'FREE' : money.format(totals.shipping)}
                                </dd>
                            </div>

                            <div>
                                <dt>Tax</dt>
                                <dd>{money.format(totals.tax)}</dd>
                            </div>
                        </dl>

                        <div className="oc-summary-total">
                            <span>Total</span>
                            <strong>{money.format(totals.total)}</strong>
                        </div>
                    </aside>
                </div>

                {/* ---------------------------- actions ---------------------------- */}
                <div className="oc-actions">
                    <button type="button" className="oc-primary" onClick={() => navigate('/')}>
                        Continue Shopping
                    </button>

                    <button
                        type="button"
                        className="oc-secondary"
                        onClick={() => setHistoryOpen((open) => !open)}
                        aria-expanded={historyOpen}
                    >
                        {historyOpen ? 'Hide Order History' : 'View Order History'}
                    </button>
                </div>

                <OrderHistory
                    open={historyOpen}
                    onClose={() => setHistoryOpen(false)}
                    userId={user?.id}
                    currentOrderNumber={order.orderNumber}
                />

                {/* ---------------------------- support ---------------------------- */}
                <section className="oc-support">
                    <span className="oc-support-icon" aria-hidden="true">
                        <i className="bi bi-question-lg" />
                    </span>

                    <div className="oc-support-copy">
                        <h2>Need help with your order?</h2>
                        <p>
                            Our support team is available 24/7. Reference order{' '}
                            <strong>{order.orderNumber}</strong> when contacting us.
                        </p>
                    </div>

                    <button type="button" className="oc-support-button" onClick={contactSupport}>
                        Contact Support
                    </button>
                </section>

                <p className="oc-footnote">
                    {itemCount} item(s) · Placed {formatShortTime(new Date(order.placedAt))}
                    {order.serverCartId ? ` · Reference #${order.serverCartId}` : ''}
                </p>
            </div>
        </main>
    );
};

export default OrderConfirmation;
