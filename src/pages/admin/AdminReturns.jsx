import React, { useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link } from 'react-router-dom';
import { useWallet, returnState, isReturnOpen } from '../../contexts/WalletContext.jsx';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { useNotification } from '../../components/Notification.jsx';
import AdminModal, { ConfirmDialog } from './AdminModal.jsx';
import AdminPager from './AdminPager.jsx';
import './AdminReturns.css';

const FILTERS = [
    { id: 'open', label: 'Needs action' },
    { id: 'requested', label: 'Awaiting review' },
    { id: 'awaiting-courier', label: 'Awaiting courier' },
    { id: 'refunded', label: 'Refunded' },
    { id: 'paid-cash', label: 'Paid cash' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'all', label: 'All' },
];

const formatDate = (value) =>
    new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

const hoursSince = (value) => (Date.now() - new Date(value).getTime()) / 3_600_000;

/* Anything sitting unreviewed for more than a day is late. */
const isOverdue = (entry) => entry.status === 'requested' && hoursSince(entry.at) > 24;

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const AdminReturns = () => {
    const { returns, approveReturn, rejectReturn, confirmCourierPayout } = useWallet();
    const { format } = useCurrency();
    const { notify } = useNotification();

    const [filter, setFilter] = useState('open');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [detail, setDetail] = useState(null);
    const [adminNote, setAdminNote] = useState('');
    const [rejecting, setRejecting] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setPage(1);
    }, [filter, query, pageSize]);

    /* ----------------------------- stats ----------------------------- */
    const stats = useMemo(() => {
        const open = returns.filter(isReturnOpen);
        const pending = returns.filter((entry) => entry.status === 'requested');
        const settled = returns.filter((entry) =>
            ['refunded', 'paid-cash'].includes(entry.status)
        );

        const reasons = {};
        returns.forEach((entry) => {
            reasons[entry.reason] = (reasons[entry.reason] || 0) + 1;
        });

        const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];

        return {
            open: open.length,
            pending: pending.length,
            overdue: returns.filter(isOverdue).length,
            refundedValue: settled.reduce((sum, entry) => sum + entry.amount, 0),
            pendingValue: open.reduce((sum, entry) => sum + entry.amount, 0),
            topReason: topReason ? { label: topReason[0], count: topReason[1] } : null,
            rejectRate: returns.length
                ? (returns.filter((entry) => entry.status === 'rejected').length / returns.length) * 100
                : 0,
        };
    }, [returns]);

    /* ---------------------------- filtering -------------------------- */
    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();

        return returns
            .filter((entry) => {
                if (filter === 'open' && !isReturnOpen(entry)) return false;
                if (!['open', 'all'].includes(filter) && entry.status !== filter) return false;

                if (!term) return true;
                return (
                    entry.id.toLowerCase().includes(term) ||
                    entry.orderNumber.toLowerCase().includes(term) ||
                    entry.reason.toLowerCase().includes(term) ||
                    entry.items.some((item) => item.title.toLowerCase().includes(term))
                );
            })
            /* Oldest open requests first — the ones aging are the ones that
               need a decision, so sorting newest-first would bury them. */
            .sort((a, b) => {
                const aOpen = isReturnOpen(a);
                const bOpen = isReturnOpen(b);
                if (aOpen !== bOpen) return aOpen ? -1 : 1;
                return aOpen
                    ? new Date(a.at) - new Date(b.at)
                    : new Date(b.at) - new Date(a.at);
            });
    }, [returns, filter, query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    const countFor = (id) =>
        id === 'all'
            ? returns.length
            : id === 'open'
                ? returns.filter(isReturnOpen).length
                : returns.filter((entry) => entry.status === id).length;

    /* ----------------------------- actions --------------------------- */
    const openDetail = (entry) => {
        setDetail(entry);
        setAdminNote(entry.adminNote || '');
    };

    const doApprove = async (entry, note) => {
        setBusy(true);
        approveReturn(entry.id, note);
        setBusy(false);
        setDetail(null);
    };

    const doReject = () => {
        setBusy(true);
        rejectReturn(rejecting.id, adminNote);
        setBusy(false);
        setRejecting(null);
        setDetail(null);
    };

    const exportCsv = () => {
        if (!filtered.length) {
            notify.warning('Nothing to export', 'No returns match the current filter.');
            return;
        }

        const header = [
            'Return ID', 'Order', 'Requested', 'Status', 'Payout', 'Amount USD', 'Reason', 'Items', 'Admin note',
        ];

        const body = filtered.map((entry) => [
            entry.id,
            entry.orderNumber,
            new Date(entry.at).toISOString().slice(0, 10),
            returnState(entry).label,
            entry.payout,
            entry.amount.toFixed(2),
            entry.reason,
            entry.items.map((item) => `${item.quantity}x ${item.title}`).join(' | '),
            entry.adminNote || '',
        ]);

        const csv = `\uFEFF${[header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `returns-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        notify.success('Export ready', `${filtered.length} returns written to CSV.`);
    };

    return (
        <div className="rn-page">
            <header className="rn-header">
                <div>
                    <h1>Returns</h1>
                    <p>Review refund requests and release payouts.</p>
                </div>

                <button type="button" className="rn-export" onClick={exportCsv}>
                    <i className="bi bi-download" aria-hidden="true" />
                    Export CSV
                </button>
            </header>

            {/* ----------------------------- stats ---------------------------- */}
            <div className="rn-stats">
                <article className={`rn-stat ${stats.pending ? 'is-alert' : ''}`}>
                    <span className="rn-stat-icon is-amber" aria-hidden="true">
                        <i className="bi bi-hourglass-split" />
                    </span>
                    <div>
                        <span>Awaiting review</span>
                        <strong>{stats.pending}</strong>
                        {stats.overdue > 0 && (
                            <small className="is-bad">{stats.overdue} over 24h</small>
                        )}
                    </div>
                </article>

                <article className="rn-stat">
                    <span className="rn-stat-icon is-violet" aria-hidden="true">
                        <i className="bi bi-cash-coin" />
                    </span>
                    <div>
                        <span>Pending value</span>
                        <strong>{format(stats.pendingValue)}</strong>
                        <small>{stats.open} open request{stats.open === 1 ? '' : 's'}</small>
                    </div>
                </article>

                <article className="rn-stat">
                    <span className="rn-stat-icon is-blue" aria-hidden="true">
                        <i className="bi bi-arrow-counterclockwise" />
                    </span>
                    <div>
                        <span>Refunded to date</span>
                        <strong>{format(stats.refundedValue)}</strong>
                        <small>{stats.rejectRate.toFixed(0)}% rejected</small>
                    </div>
                </article>

                <article className="rn-stat">
                    <span className="rn-stat-icon is-rose" aria-hidden="true">
                        <i className="bi bi-chat-square-quote" />
                    </span>
                    <div>
                        <span>Top reason</span>
                        <strong className="is-text">{stats.topReason?.label || '—'}</strong>
                        <small>
                            {stats.topReason ? `${stats.topReason.count} request${stats.topReason.count === 1 ? '' : 's'}` : 'No data yet'}
                        </small>
                    </div>
                </article>
            </div>

            {/* ---------------------------- toolbar --------------------------- */}
            <div className="rn-toolbar">
                <div className="rn-search">
                    <i className="bi bi-search" aria-hidden="true" />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search by return ID, order, item or reason..."
                        aria-label="Search returns"
                    />
                    {query && (
                        <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                            <i className="bi bi-x-lg" aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            <div className="rn-tabs" role="tablist" aria-label="Filter returns">
                {FILTERS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        role="tab"
                        aria-selected={filter === option.id}
                        className={filter === option.id ? 'is-active' : ''}
                        onClick={() => setFilter(option.id)}
                    >
                        {option.label}
                        <span className="rn-tab-count">{countFor(option.id)}</span>
                    </button>
                ))}
            </div>

            {/* ----------------------------- table ---------------------------- */}
            <section className="rn-card">
                {returns.length === 0 ? (
                    <div className="rn-empty">
                        <i className="bi bi-box-seam" aria-hidden="true" />
                        <p>No return requests yet.</p>
                        <small>
                            Requests appear here as soon as a customer submits one from their order history.
                        </small>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="rn-empty">
                        <i className="bi bi-search" aria-hidden="true" />
                        <p>Nothing matches this filter.</p>
                        <button type="button" onClick={() => { setFilter('all'); setQuery(''); }}>
                            Show all returns
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="rn-table-wrap">
                            <table className="rn-table">
                                <thead>
                                    <tr>
                                        <th>Request</th>
                                        <th>Items</th>
                                        <th>Reason</th>
                                        <th>Payout</th>
                                        <th>Amount</th>
                                        <th>Status</th>
                                        <th aria-label="Actions" />
                                    </tr>
                                </thead>

                                <tbody>
                                    {rows.map((entry) => {
                                        const state = returnState(entry);
                                        const overdue = isOverdue(entry);

                                        return (
                                            <tr key={entry.id} className={overdue ? 'is-overdue' : ''}>
                                                <td>
                                                    <div className="rn-req">
                                                        <button
                                                            type="button"
                                                            className="rn-req-id"
                                                            onClick={() => openDetail(entry)}
                                                        >
                                                            {entry.id}
                                                        </button>
                                                        <span>
                                                            {entry.orderNumber} · {formatDate(entry.at)}
                                                            {overdue && (
                                                                <span className="rn-overdue-tag">
                                                                    <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
                                                                    {Math.floor(hoursSince(entry.at))}h
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                </td>

                                                <td data-label="Items">
                                                    <div className="rn-items">
                                                        {entry.items.slice(0, 3).map((item) => (
                                                            <span className="rn-item-thumb" key={item.id} title={item.title}>
                                                                <img src={item.thumbnail} alt="" loading="lazy" />
                                                                <b>{item.quantity}</b>
                                                            </span>
                                                        ))}
                                                        {entry.items.length > 3 && (
                                                            <span className="rn-item-more">+{entry.items.length - 3}</span>
                                                        )}
                                                    </div>
                                                </td>

                                                <td data-label="Reason">
                                                    <span className="rn-reason">{entry.reason}</span>
                                                </td>

                                                <td data-label="Payout">
                                                    <span className={`rn-payout is-${entry.payout}`}>
                                                        <i
                                                            className={`bi ${entry.payout === 'wallet' ? 'bi-wallet2' : 'bi-cash'}`}
                                                            aria-hidden="true"
                                                        />
                                                        {entry.payout === 'wallet' ? 'Wallet' : 'Cash'}
                                                    </span>
                                                </td>

                                                <td data-label="Amount">
                                                    <strong>{format(entry.amount)}</strong>
                                                </td>

                                                <td data-label="Status">
                                                    <span className={`rn-status is-${state.tone}`}>
                                                        <span className="rn-status-dot" aria-hidden="true" />
                                                        {state.label}
                                                    </span>
                                                </td>

                                                <td className="rn-actions">
                                                    <div className="rn-actions-inner">
                                                        {entry.status === 'requested' && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="is-ok"
                                                                    onClick={() => doApprove(entry, '')}
                                                                    title="Approve this return"
                                                                >
                                                                    <i className="bi bi-check-lg" aria-hidden="true" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="is-danger"
                                                                    onClick={() => {
                                                                        setRejecting(entry);
                                                                        setAdminNote('');
                                                                    }}
                                                                    title="Reject this return"
                                                                >
                                                                    <i className="bi bi-x-lg" aria-hidden="true" />
                                                                </button>
                                                            </>
                                                        )}

                                                        {entry.status === 'awaiting-courier' && (
                                                            <button
                                                                type="button"
                                                                className="is-ok is-wide"
                                                                onClick={() => confirmCourierPayout(entry.id)}
                                                                title="Courier handed over the cash"
                                                            >
                                                                <i className="bi bi-cash-stack" aria-hidden="true" />
                                                                Paid
                                                            </button>
                                                        )}

                                                        <button
                                                            type="button"
                                                            onClick={() => openDetail(entry)}
                                                            title="View details"
                                                        >
                                                            <i className="bi bi-eye" aria-hidden="true" />
                                                        </button>
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
                            label="returns"
                        />
                    </>
                )}
            </section>

            {/* ----------------------------- detail --------------------------- */}
            <AdminModal
                open={Boolean(detail)}
                onClose={() => setDetail(null)}
                title={detail ? `Return ${detail.id}` : ''}
                subtitle={detail ? `${detail.orderNumber} · requested ${formatDate(detail.at)}` : ''}
                icon="bi-box-arrow-in-left"
                size="md"
                footer={
                    detail?.status === 'requested' ? (
                        <>
                            <button
                                type="button"
                                className="am-btn is-danger"
                                onClick={() => {
                                    setRejecting(detail);
                                }}
                                disabled={busy}
                            >
                                Reject
                            </button>
                            <button
                                type="button"
                                className="am-btn"
                                onClick={() => doApprove(detail, adminNote)}
                                disabled={busy}
                            >
                                {busy ? (
                                    <>
                                        <span className="am-spinner" aria-hidden="true" />
                                        Working…
                                    </>
                                ) : (
                                    <>
                                        <i className="bi bi-check-lg" aria-hidden="true" />
                                        Approve refund
                                    </>
                                )}
                            </button>
                        </>
                    ) : (
                        <button type="button" className="am-btn is-plain" onClick={() => setDetail(null)}>
                            Close
                        </button>
                    )
                }
            >
                {detail && (
                    <div className="rn-detail">
                        <div className="rn-detail-top">
                            <span className={`rn-status is-${returnState(detail).tone}`}>
                                <span className="rn-status-dot" aria-hidden="true" />
                                {returnState(detail).label}
                            </span>
                            <strong>{format(detail.amount)}</strong>
                        </div>

                        <ul className="rn-detail-items">
                            {detail.items.map((item) => (
                                <li key={item.id}>
                                    <span className="rn-detail-thumb">
                                        <img src={item.thumbnail} alt="" loading="lazy" />
                                    </span>
                                    <div>
                                        <strong>{item.title}</strong>
                                        <span>
                                            {item.quantity} × {format(item.price)}
                                        </span>
                                    </div>
                                    <strong>{format(item.price * item.quantity)}</strong>
                                </li>
                            ))}
                        </ul>

                        <dl className="rn-detail-meta">
                            <div>
                                <dt>Reason</dt>
                                <dd>{detail.reason}</dd>
                            </div>
                            <div>
                                <dt>Payout method</dt>
                                <dd>
                                    {detail.payout === 'wallet'
                                        ? 'Store credit — settles instantly on approval'
                                        : 'Cash from courier on collection'}
                                </dd>
                            </div>
                            {detail.note && (
                                <div>
                                    <dt>Customer note</dt>
                                    <dd className="is-quote">“{detail.note}”</dd>
                                </div>
                            )}
                            {detail.adminNote && (
                                <div>
                                    <dt>Internal note</dt>
                                    <dd className="is-quote">“{detail.adminNote}”</dd>
                                </div>
                            )}
                            <div>
                                <dt>Order</dt>
                                <dd>
                                    <Link to="/admin/orders">{detail.orderNumber}</Link>
                                </dd>
                            </div>
                        </dl>

                        {detail.status === 'requested' && (
                            <div className="am-field is-full">
                                <label htmlFor="rn-note">Internal note (optional)</label>
                                <textarea
                                    id="rn-note"
                                    value={adminNote}
                                    onChange={(event) => setAdminNote(event.target.value)}
                                    placeholder="Visible to staff only — e.g. item inspected, packaging intact."
                                />
                            </div>
                        )}
                    </div>
                )}
            </AdminModal>

            {/* ---------------------------- rejection -------------------------- */}
            <ConfirmDialog
                open={Boolean(rejecting)}
                onClose={() => setRejecting(null)}
                onConfirm={doReject}
                busy={busy}
                title="Reject this return?"
                message={
                    rejecting?.status === 'refunded'
                        ? 'This refund was already credited. Rejecting it now will reverse the amount from the customer wallet.'
                        : 'The customer will be told the request was refused. The items become available to return again.'
                }
                confirmLabel="Reject request"
                cancelLabel="Keep reviewing"
                footnote="The customer sees your reason"
            >
                {rejecting && (
                    <>
                        <div className="am-preview">
                            <span className="am-preview-thumb">
                                <img src={rejecting.items[0]?.thumbnail} alt="" />
                            </span>
                            <span className="am-preview-info">
                                <span className="am-preview-tag is-out">{rejecting.id}</span>
                                <strong>
                                    {rejecting.items.length} item{rejecting.items.length === 1 ? '' : 's'}
                                </strong>
                                <span className="am-preview-meta">
                                    {rejecting.orderNumber}
                                    <strong>{format(rejecting.amount)}</strong>
                                </span>
                            </span>
                        </div>

                        <div className="am-field is-full rn-reject-note">
                            <label htmlFor="rn-reject-note">Reason for rejection</label>
                            <textarea
                                id="rn-reject-note"
                                value={adminNote}
                                onChange={(event) => setAdminNote(event.target.value)}
                                placeholder="e.g. Returned outside the 30-day window."
                            />
                        </div>
                    </>
                )}
            </ConfirmDialog>
        </div>
    );
};

export default AdminReturns;
