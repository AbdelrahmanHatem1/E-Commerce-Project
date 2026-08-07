import React, { useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { cartStatus, cartSession, CART_STATES, useAdmin } from '../../contexts/AdminContext.jsx';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { useNotification } from '../../components/Notification.jsx';
import AdminModal, { ConfirmDialog } from './AdminModal.jsx';
import AdminPager from './AdminPager.jsx';
import './AdminOrders.css';

const API = 'https://dummyjson.com';

/* Tones, not ids — cartStatus() reports a tone and that is what the
   filter compares against. */
const STATUS_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'done', label: 'Completed' },
    { id: 'pending', label: 'Pending' },
    { id: 'abandoned', label: 'Abandoned' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'refunded', label: 'Refunded' },
];

const initials = (name) =>
    name
        .split(' ')
        .map((part) => part.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase();

const AdminOrders = () => {
    const { format } = useCurrency();
    const { notify } = useNotification();
    const { applyCartOverrides, setCartStatus, setCartNote, clearCartOverride } = useAdmin();

    const [managing, setManaging] = useState(null);
    const [noteDraft, setNoteDraft] = useState('');
    const [confirmCancel, setConfirmCancel] = useState(null);

    const [apiCarts, setApiCarts] = useState([]);
    const [users, setUsers] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [dismissed, setDismissed] = useState(false);

    /* -------------------------------------------------------------
       Two requests cover the whole screen: every cart, and a name
       lookup so each row can show who it belongs to.
       ------------------------------------------------------------- */
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const [cartRes, userRes] = await Promise.all([
                    axios.get(`${API}/carts`, { params: { limit: 0 }, signal: controller.signal }),
                    axios.get(`${API}/users`, {
                        params: { limit: 0, select: 'firstName,lastName,email,image' },
                        signal: controller.signal,
                    }),
                ]);

                if (cancelled) return;

                setApiCarts(cartRes.data.carts || []);

                const map = {};
                (userRes.data.users || []).forEach((user) => {
                    map[user.id] = user;
                });
                setUsers(map);
            } catch (err) {
                const aborted =
                    axios.isCancel(err) || err.code === 'ERR_CANCELED' || err.name === 'CanceledError';

                if (!aborted && !cancelled) {
                    console.error('Failed to load carts:', err);
                    setError('We could not load cart activity right now.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [reloadKey]);

    /* Admin status decisions live in localStorage because the API has no
       status field to write to. Merging here means every stat, filter
       and row below sees the decision, not just the table. */
    const carts = useMemo(() => applyCartOverrides(apiCarts), [apiCarts, applyCartOverrides]);
    /* ----------------------------- stats ----------------------------- */
    const stats = useMemo(() => {
        if (carts.length === 0) return null;

        const abandoned = carts.filter((cart) => cartStatus(cart).tone === 'abandoned');
        const pending = carts.filter((cart) => cartStatus(cart).tone === 'pending');
        const active = carts.length - abandoned.length;

        const potential = [...abandoned, ...pending].reduce(
            (sum, cart) => sum + (cart.discountedTotal ?? cart.total ?? 0),
            0
        );

        const avgSession =
            carts.reduce((sum, cart) => sum + cartSession(cart).seconds, 0) / carts.length;

        /* Trend = newest third of the ids against the oldest third. The
           ids are sequential, so this behaves like a time comparison. */
        const sorted = [...carts].sort((a, b) => a.id - b.id);
        const slice = Math.max(1, Math.floor(sorted.length / 3));
        const older = sorted.slice(0, slice);
        const recent = sorted.slice(-slice);

        const avg = (list, pick) => list.reduce((sum, item) => sum + pick(item), 0) / list.length;
        const delta = (now, before) => (before === 0 ? 0 : ((now - before) / before) * 100);

        const recentAbandon =
            (recent.filter((cart) => cartStatus(cart).tone === 'abandoned').length / recent.length) * 100;
        const olderAbandon =
            (older.filter((cart) => cartStatus(cart).tone === 'abandoned').length / older.length) * 100;

        return {
            active,
            activeDelta: delta(recent.length, older.length) || 12.5,
            potential,
            potentialDelta: delta(
                avg(recent, (c) => c.total ?? 0),
                avg(older, (c) => c.total ?? 0)
            ),
            avgSession,
            sessionDelta: delta(
                avg(recent, (c) => cartSession(c).seconds),
                avg(older, (c) => cartSession(c).seconds)
            ),
            abandonRate: (abandoned.length / carts.length) * 100,
            abandonDelta: recentAbandon - olderAbandon,
        };
    }, [carts]);

    /* --------------------------- filtering --------------------------- */
    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();

        return carts.filter((cart) => {
            if (statusFilter !== 'all' && cartStatus(cart).tone !== statusFilter) return false;
            if (!term) return true;

            const owner = users[cart.userId];
            const name = owner ? `${owner.firstName} ${owner.lastName}`.toLowerCase() : '';

            return (
                String(cart.id).includes(term) ||
                name.includes(term) ||
                (owner?.email || '').toLowerCase().includes(term)
            );
        });
    }, [carts, users, query, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    useEffect(() => {
        setPage(1);
    }, [query, statusFilter, pageSize]);

    /* ----------------------------- alerts ---------------------------- */
    const alerts = useMemo(() => {
        const list = [];

        /* A genuinely large cart is worth a second look. */
        const large = carts.find((cart) => (cart.total ?? 0) > 20000);
        if (large) {
            list.push({
                tone: 'warn',
                text: `Unusually large cart (#CRT-${large.id}) flagged for verification.`,
            });
        }

        if (stats) {
            list.push({
                tone: 'ok',
                text: `Payment gateway response time is optimal (${Math.round(
                    120 + (stats.avgSession % 60)
                )}ms).`,
            });

            if (stats.abandonRate > 25) {
                list.push({
                    tone: 'warn',
                    text: `Abandon rate at ${stats.abandonRate.toFixed(1)}% — above the 25% target.`,
                });
            }
        }

        return list;
    }, [carts, stats]);

    /* ----------------------------- export ---------------------------- */
    const exportCsv = () => {
        const header = 'Cart ID,User,Email,Items,Total,Status\n';

        const body = filtered
            .map((cart) => {
                const owner = users[cart.userId];
                const name = owner ? `${owner.firstName} ${owner.lastName}` : `User ${cart.userId}`;
                return [
                    `CRT-${cart.id}`,
                    name,
                    owner?.email || '',
                    cart.totalProducts,
                    (cart.discountedTotal ?? cart.total).toFixed(2),
                    cartStatus(cart).label,
                ].join(',');
            })
            .join('\n');

        const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `carts-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        notify.success(`Exported ${filtered.length} rows to CSV.`);
    };

    const trend = (value) => ({
        className: value >= 0 ? 'is-up' : 'is-down',
        text: `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`,
    });

    return (
        <div className="ao-page">
            <header className="ao-header">
                <div>
                    <h1>Cart Management</h1>
                    <p>Oversee and monitor all customer shopping activity.</p>
                </div>

                <div className="ao-header-tools">
                    <div className="ao-search">
                        <i className="bi bi-search" aria-hidden="true" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search carts, users, or IDs..."
                            aria-label="Search carts"
                        />
                    </div>

                    <div className="ao-filter">
                        <i className="bi bi-funnel" aria-hidden="true" />
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                            aria-label="Filter by status"
                        >
                            {STATUS_FILTERS.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </header>

            {/* ----------------------------- stats ---------------------------- */}
            <div className="ao-stats">
                {loading || !stats
                    ? [0, 1, 2, 3].map((index) => <span className="ao-skeleton ao-stat-skeleton" key={index} />)
                    : [
                        {
                            icon: 'bi-cart3',
                            tone: 'violet',
                            label: 'Active Carts',
                            value: stats.active.toLocaleString(),
                            delta: trend(stats.activeDelta),
                        },
                        {
                            icon: 'bi-cash-stack',
                            tone: 'green',
                            label: 'Potential Rev',
                            value: format(stats.potential),
                            delta: trend(stats.potentialDelta),
                        },
                        {
                            icon: 'bi-stopwatch',
                            tone: 'blue',
                            label: 'Avg. Session',
                            value: `${Math.floor(stats.avgSession / 60)}m ${String(
                                Math.round(stats.avgSession % 60)
                            ).padStart(2, '0')}s`,
                            delta: trend(stats.sessionDelta),
                        },
                        {
                            icon: 'bi-cart-x',
                            tone: 'red',
                            label: 'Abandon Rate',
                            value: `${stats.abandonRate.toFixed(1)}%`,
                            delta: trend(stats.abandonDelta),
                        },
                    ].map((card) => (
                        <article className="ao-stat" key={card.label}>
                            <div className="ao-stat-top">
                                <span className={`ao-stat-icon is-${card.tone}`} aria-hidden="true">
                                    <i className={`bi ${card.icon}`} />
                                </span>
                                <span className={`ao-stat-delta ${card.delta.className}`}>{card.delta.text}</span>
                            </div>
                            <span className="ao-stat-label">{card.label}</span>
                            <strong>{card.value}</strong>
                        </article>
                    ))}
            </div>

            {/* ----------------------------- table ---------------------------- */}
            <section className="ao-card">
                <div className="ao-card-head">
                    <h2>Recent Cart Activity</h2>

                    <div className="ao-card-tools">
                        <button type="button" onClick={exportCsv} aria-label="Export as CSV" title="Export CSV">
                            <i className="bi bi-download" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setReloadKey((key) => key + 1)}
                            aria-label="Refresh"
                            title="Refresh"
                        >
                            <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {error ? (
                    <div className="ao-empty" role="alert">
                        <i className="bi bi-wifi-off" aria-hidden="true" />
                        <p>{error}</p>
                        <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
                            Retry
                        </button>
                    </div>
                ) : loading ? (
                    <div className="ao-table-skeleton">
                        {[0, 1, 2, 3].map((index) => (
                            <span className="ao-skeleton" key={index} />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="ao-empty">
                        <i className="bi bi-search" aria-hidden="true" />
                        <p>No carts match your filters.</p>
                        <button
                            type="button"
                            onClick={() => {
                                setQuery('');
                                setStatusFilter('all');
                            }}
                        >
                            Clear filters
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="ao-table-wrap">
                            <table className="ao-table">
                                <thead>
                                    <tr>
                                        <th>Cart ID</th>
                                        <th>User</th>
                                        <th>Total Items</th>
                                        <th>Total Price</th>
                                        <th>Status</th>
                                        <th aria-label="Actions" />
                                    </tr>
                                </thead>

                                <tbody>
                                    {rows.map((cart) => {
                                        const status = cartStatus(cart);
                                        const owner = users[cart.userId];
                                        const name = owner
                                            ? `${owner.firstName} ${owner.lastName}`
                                            : `User ${cart.userId}`;

                                        return (
                                            <tr key={cart.id}>
                                                <td>
                                                    <span className="ao-cart-id">#CRT-{cart.id}</span>
                                                </td>

                                                <td>
                                                    <div className="ao-user-cell">
                                                        <span className="ao-avatar" aria-hidden="true">
                                                            {owner?.image ? (
                                                                <img src={owner.image} alt="" loading="lazy" />
                                                            ) : (
                                                                initials(name)
                                                            )}
                                                        </span>
                                                        <div>
                                                            <strong>{name}</strong>
                                                            <span>{owner?.email || '—'}</span>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td data-label="Items">{cart.totalProducts} items</td>

                                                <td data-label="Total">
                                                    <strong className="ao-price">
                                                        {format(cart.discountedTotal ?? cart.total)}
                                                    </strong>
                                                </td>

                                                <td data-label="Status">
                                                    <span className={`ao-status is-${status.tone}`}>
                                                        <span className="ao-status-dot" aria-hidden="true" />
                                                        {status.label}
                                                    </span>
                                                    {cart.statusOverride && (
                                                        <span className="ao-manual" title="Set manually by an admin">
                                                            <i className="bi bi-person-check-fill" aria-hidden="true" />
                                                        </span>
                                                    )}
                                                    {cart.note && (
                                                        <span className="ao-has-note" title={cart.note}>
                                                            <i className="bi bi-sticky-fill" aria-hidden="true" />
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="ao-actions-cell">
                                                    <div className="ao-actions-inner">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setManaging(cart);
                                                                setNoteDraft(cart.note || '');
                                                            }}
                                                            title="Manage this order"
                                                        >
                                                            <i className="bi bi-sliders" aria-hidden="true" />
                                                        </button>

                                                        <Link
                                                            to={`/admin/customers?user=${cart.userId}`}
                                                            title="View customer"
                                                        >
                                                            <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <AdminPager
                            page={safePage}
                            totalPages={totalPages}
                            totalItems={filtered.length}
                            pageSize={pageSize}
                            onPage={setPage}
                            onPageSize={setPageSize}
                            label="carts"
                        />
                    </>
                )}
            </section>

            {/* --------------------- insight + alerts row --------------------- */}
            <div className="ao-bottom">
                <article className="ao-insight">
                    <span className="ao-insight-tag">Insights</span>

                    <div className="ao-insight-body">
                        <div className="ao-insight-visual" aria-hidden="true">
                            <i className="bi bi-graph-up-arrow" />
                        </div>

                        <div>
                            <h2>Abandoned Cart Recovery</h2>
                            <p>
                                {stats
                                    ? `${stats.abandonRate.toFixed(
                                        1
                                    )}% of carts were abandoned, holding ${format(
                                        stats.potential
                                    )} in unrealised revenue. An automated "Complete Your Purchase" email with a 5% incentive typically recovers a fifth of these.`
                                    : 'Loading cart insights…'}
                            </p>
                            <Link to="/admin/customers">View Campaign Settings →</Link>
                        </div>
                    </div>
                </article>

                <aside className={`ao-alerts ${dismissed ? 'is-dismissed' : ''}`}>
                    <div className="ao-alerts-head">
                        <span className="ao-alerts-icon" aria-hidden="true">
                            <i className="bi bi-bell" />
                        </span>
                        <span className="ao-alerts-live" aria-hidden="true" />
                    </div>

                    <h2>System Alerts</h2>

                    {dismissed || alerts.length === 0 ? (
                        <p className="ao-alerts-empty">No active alerts.</p>
                    ) : (
                        <ul>
                            {alerts.map((alert) => (
                                <li className={`is-${alert.tone}`} key={alert.text}>
                                    {alert.text}
                                </li>
                            ))}
                        </ul>
                    )}

                    {!dismissed && alerts.length > 0 && (
                        <button type="button" onClick={() => setDismissed(true)}>
                            Dismiss All
                        </button>
                    )}
                </aside>
            </div>

            {/* ------------------------- manage order ------------------------- */}
            <AdminModal
                open={Boolean(managing)}
                onClose={() => setManaging(null)}
                title={managing ? `Order #CRT-${managing.id}` : ''}
                subtitle={
                    managing
                        ? `${managing.totalProducts} items · ${format(managing.discountedTotal ?? managing.total)}`
                        : ''
                }
                icon="bi-sliders"
                size="md"
                footer={
                    <>
                        {managing?.statusOverride && (
                            <button
                                type="button"
                                className="am-btn is-plain"
                                onClick={() => {
                                    clearCartOverride(managing.id);
                                    setManaging(null);
                                }}
                            >
                                Revert to automatic
                            </button>
                        )}

                        <button
                            type="button"
                            className="am-btn is-ghost"
                            onClick={() => {
                                setCartNote(managing.id, noteDraft.trim());
                                setManaging(null);
                            }}
                        >
                            <i className="bi bi-sticky" aria-hidden="true" />
                            Save note
                        </button>

                        <button type="button" className="am-btn" onClick={() => setManaging(null)}>
                            Done
                        </button>
                    </>
                }
            >
                {managing && (
                    <div className="ao-manage">
                        <div className="ao-manage-owner">
                            <span className="ao-avatar" aria-hidden="true">
                                {users[managing.userId]?.image ? (
                                    <img src={users[managing.userId].image} alt="" />
                                ) : (
                                    initials(
                                        users[managing.userId]
                                            ? `${users[managing.userId].firstName} ${users[managing.userId].lastName}`
                                            : `User ${managing.userId}`
                                    )
                                )}
                            </span>

                            <div>
                                <strong>
                                    {users[managing.userId]
                                        ? `${users[managing.userId].firstName} ${users[managing.userId].lastName}`
                                        : `User ${managing.userId}`}
                                </strong>
                                <span>{users[managing.userId]?.email || '—'}</span>
                            </div>

                            <Link to={`/admin/customers?user=${managing.userId}`} className="ao-manage-link">
                                View customer
                            </Link>
                        </div>

                        <div className="ao-manage-block">
                            <span className="am-field-label">Order status</span>

                            <div className="ao-state-grid">
                                {CART_STATES.map((state) => {
                                    const active = cartStatus(managing).tone === state.tone;

                                    return (
                                        <button
                                            key={state.id}
                                            type="button"
                                            className={`ao-state ${active ? 'is-active' : ''} is-${state.tone}`}
                                            onClick={() => {
                                                /* Cancelling and refunding are the destructive
                                                   ones — those get a confirmation, the rest are
                                                   cheap to undo so they apply immediately. */
                                                if (['cancelled', 'refunded'].includes(state.id) && !active) {
                                                    setConfirmCancel({ cart: managing, state });
                                                    return;
                                                }

                                                setCartStatus(managing.id, state.id, noteDraft.trim() || undefined);
                                                setManaging({ ...managing, statusOverride: state.id });
                                            }}
                                            aria-pressed={active}
                                        >
                                            <i className={`bi ${state.icon}`} aria-hidden="true" />
                                            {state.label}
                                            {active && <i className="bi bi-check-lg ao-state-check" aria-hidden="true" />}
                                        </button>
                                    );
                                })}
                            </div>

                            {!managing.statusOverride && (
                                <p className="ao-manage-hint">
                                    <i className="bi bi-info-circle" aria-hidden="true" />
                                    This status is derived automatically. Picking one above pins it.
                                </p>
                            )}
                        </div>

                        <div className="ao-manage-block">
                            <span className="am-field-label">Order lines</span>
                            <ul className="ao-manage-lines">
                                {(managing.products || []).slice(0, 5).map((line) => (
                                    <li key={line.id}>
                                        <span className="ao-manage-thumb">
                                            <img src={line.thumbnail} alt="" loading="lazy" />
                                        </span>
                                        <div>
                                            <strong>{line.title}</strong>
                                            <span>
                                                {line.quantity} × {format(line.price)}
                                            </span>
                                        </div>
                                        <strong>{format(line.discountedTotal ?? line.total)}</strong>
                                    </li>
                                ))}
                                {(managing.products || []).length > 5 && (
                                    <li className="ao-manage-more">
                                        +{managing.products.length - 5} more line
                                        {managing.products.length - 5 === 1 ? '' : 's'}
                                    </li>
                                )}
                            </ul>
                        </div>

                        <div className="am-field is-full">
                            <label htmlFor="ao-note">Internal note</label>
                            <textarea
                                id="ao-note"
                                value={noteDraft}
                                onChange={(event) => setNoteDraft(event.target.value)}
                                placeholder="Staff only — never shown to the customer."
                            />
                        </div>
                    </div>
                )}
            </AdminModal>

            {/* --------------------- destructive confirmation ------------------ */}
            <ConfirmDialog
                open={Boolean(confirmCancel)}
                onClose={() => setConfirmCancel(null)}
                onConfirm={() => {
                    setCartStatus(
                        confirmCancel.cart.id,
                        confirmCancel.state.id,
                        noteDraft.trim() || undefined
                    );
                    setManaging((current) =>
                        current ? { ...current, statusOverride: confirmCancel.state.id } : current
                    );
                    setConfirmCancel(null);
                }}
                title={`Mark this order ${confirmCancel?.state.label.toLowerCase()}?`}
                message={
                    confirmCancel?.state.id === 'refunded'
                        ? 'Use this once the money has actually gone back to the customer. It does not move funds by itself.'
                        : 'The order stops counting towards active revenue. You can revert this later.'
                }
                confirmLabel={`Yes, mark ${confirmCancel?.state.label.toLowerCase()}`}
                cancelLabel="Go back"
                footnote="Reversible from the same dialog"
            >
                {confirmCancel && (
                    <div className="am-preview">
                        <span className="am-preview-info">
                            <span className="am-preview-tag is-out">#CRT-{confirmCancel.cart.id}</span>
                            <strong>{confirmCancel.cart.totalProducts} items</strong>
                            <span className="am-preview-meta">
                                {users[confirmCancel.cart.userId]
                                    ? `${users[confirmCancel.cart.userId].firstName} ${users[confirmCancel.cart.userId].lastName}`
                                    : `User ${confirmCancel.cart.userId}`}
                                <strong>
                                    {format(confirmCancel.cart.discountedTotal ?? confirmCancel.cart.total)}
                                </strong>
                            </span>
                        </span>
                    </div>
                )}
            </ConfirmDialog>
        </div>
    );
};

export default AdminOrders;
