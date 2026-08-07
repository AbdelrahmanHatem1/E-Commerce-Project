import React, { useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import {
    useSupport,
    TICKET_STATES,
    PRIORITIES,
    TOPICS,
    slaState,
    hoursOpen,
} from '../../contexts/SupportContext.jsx';
import { useNotification } from '../../components/Notification.jsx';
import AdminModal, { ConfirmDialog } from './AdminModal.jsx';
import AdminPager from './AdminPager.jsx';
import './AdminSupport.css';

const TABS = [
    { id: 'open', label: 'Open' },
    { id: 'answered', label: 'Answered' },
    { id: 'closed', label: 'Resolved' },
    { id: 'all', label: 'All' },
];

const AGENTS = ['Unassigned', 'Nadia', 'Karim', 'Salma', 'Omar'];

const relative = (value) => {
    const hours = (Date.now() - new Date(value).getTime()) / 3_600_000;
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
    if (hours < 24) return `${Math.round(hours)}h ago`;
    return `${Math.round(hours / 24)}d ago`;
};

const initials = (name) =>
    (name || '?')
        .split(' ')
        .map((part) => part.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase();

const AdminSupport = () => {
    const {
        tickets,
        openCount,
        breachedCount,
        replyToTicket,
        setPriority,
        assignTicket,
        closeTicket,
        reopenTicket,
        deleteTicket,
    } = useSupport();
    const { notify } = useNotification();

    const [tab, setTab] = useState('open');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [active, setActive] = useState(null);
    const [draft, setDraft] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);

    useEffect(() => {
        setPage(1);
    }, [tab, query, pageSize]);

    /* The dialog holds a snapshot, so refresh it whenever the underlying
       ticket changes — otherwise a reply would not appear until reopen. */
    useEffect(() => {
        if (!active) return;
        const fresh = tickets.find((item) => item.ticket === active.ticket);
        if (fresh && fresh !== active) setActive(fresh);
    }, [tickets, active]);

    const stats = useMemo(() => {
        const answered = tickets.filter((item) => item.answeredAt);

        /* Median beats mean here: one ticket left over a weekend would
           drag an average into uselessness. */
        const times = answered
            .map((item) => (new Date(item.answeredAt) - new Date(item.sentAt)) / 3_600_000)
            .sort((a, b) => a - b);

        const median = times.length
            ? times.length % 2
                ? times[(times.length - 1) / 2]
                : (times[times.length / 2 - 1] + times[times.length / 2]) / 2
            : null;

        const topics = {};
        tickets.forEach((item) => {
            topics[item.topic] = (topics[item.topic] || 0) + 1;
        });
        const top = Object.entries(topics).sort((a, b) => b[1] - a[1])[0];

        return {
            median,
            unassigned: tickets.filter((item) => item.status === 'open' && !item.assignee).length,
            topTopic: top ? { label: TOPICS[top[0]] || top[0], count: top[1] } : null,
        };
    }, [tickets]);

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();

        return tickets
            .filter((item) => {
                if (tab !== 'all' && item.status !== tab) return false;
                if (!term) return true;
                return (
                    item.ticket.toLowerCase().includes(term) ||
                    (item.name || '').toLowerCase().includes(term) ||
                    (item.email || '').toLowerCase().includes(term) ||
                    (item.message || '').toLowerCase().includes(term) ||
                    (item.orderNumber || '').toLowerCase().includes(term)
                );
            })
            /* Breached first, then oldest — the queue should surface whoever
               has been waiting longest, not whoever wrote most recently. */
            .sort((a, b) => {
                const aB = slaState(a).breached ? 1 : 0;
                const bB = slaState(b).breached ? 1 : 0;
                if (aB !== bB) return bB - aB;
                if (a.status === 'open' && b.status === 'open') {
                    return new Date(a.sentAt) - new Date(b.sentAt);
                }
                return new Date(b.sentAt) - new Date(a.sentAt);
            });
    }, [tickets, tab, query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    const countFor = (id) =>
        id === 'all' ? tickets.length : tickets.filter((item) => item.status === id).length;

    const openTicket = (ticket) => {
        setActive(ticket);
        setDraft('');
    };

    const send = (close) => {
        if (!draft.trim()) {
            notify.warning('Write a reply first.');
            return;
        }

        if (replyToTicket(active.ticket, draft, { close })) {
            setDraft('');
            if (close) setActive(null);
        }
    };

    return (
        <div className="sa-page">
            <header className="sa-header">
                <div>
                    <h1>Support Inbox</h1>
                    <p>Answer customer tickets and keep the queue moving.</p>
                </div>
            </header>

            {/* ----------------------------- stats ---------------------------- */}
            <div className="sa-stats">
                <article className={`sa-stat ${openCount ? 'is-alert' : ''}`}>
                    <span className="sa-stat-icon is-amber" aria-hidden="true">
                        <i className="bi bi-envelope-open" />
                    </span>
                    <div>
                        <span>Open tickets</span>
                        <strong>{openCount}</strong>
                        {stats.unassigned > 0 && <small>{stats.unassigned} unassigned</small>}
                    </div>
                </article>

                <article className={`sa-stat ${breachedCount ? 'is-danger' : ''}`}>
                    <span className="sa-stat-icon is-rose" aria-hidden="true">
                        <i className="bi bi-alarm" />
                    </span>
                    <div>
                        <span>SLA breached</span>
                        <strong>{breachedCount}</strong>
                        <small>Past the response window</small>
                    </div>
                </article>

                <article className="sa-stat">
                    <span className="sa-stat-icon is-violet" aria-hidden="true">
                        <i className="bi bi-stopwatch" />
                    </span>
                    <div>
                        <span>Median first reply</span>
                        <strong>{stats.median === null ? '—' : `${stats.median.toFixed(1)}h`}</strong>
                        <small>Across answered tickets</small>
                    </div>
                </article>

                <article className="sa-stat">
                    <span className="sa-stat-icon is-blue" aria-hidden="true">
                        <i className="bi bi-chat-square-text" />
                    </span>
                    <div>
                        <span>Top topic</span>
                        <strong className="is-text">{stats.topTopic?.label || '—'}</strong>
                        <small>{stats.topTopic ? `${stats.topTopic.count} tickets` : 'No data yet'}</small>
                    </div>
                </article>
            </div>

            {/* ---------------------------- toolbar --------------------------- */}
            <div className="sa-search">
                <i className="bi bi-search" aria-hidden="true" />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by ticket, name, email, order or message..."
                    aria-label="Search tickets"
                />
                {query && (
                    <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                        <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                )}
            </div>

            <div className="sa-tabs" role="tablist" aria-label="Filter tickets">
                {TABS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === option.id}
                        className={tab === option.id ? 'is-active' : ''}
                        onClick={() => setTab(option.id)}
                    >
                        {option.label}
                        <span className="sa-tab-count">{countFor(option.id)}</span>
                    </button>
                ))}
            </div>

            {/* ----------------------------- list ----------------------------- */}
            <section className="sa-card">
                {tickets.length === 0 ? (
                    <div className="sa-empty">
                        <i className="bi bi-inbox" aria-hidden="true" />
                        <p>No tickets yet.</p>
                        <small>
                            Messages sent from the storefront Support page land here the moment they are
                            submitted.
                        </small>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="sa-empty">
                        <i className="bi bi-search" aria-hidden="true" />
                        <p>Nothing matches this filter.</p>
                        <button type="button" onClick={() => { setTab('all'); setQuery(''); }}>
                            Show all tickets
                        </button>
                    </div>
                ) : (
                    <>
                        <ul className="sa-list">
                            {rows.map((ticket) => {
                                const sla = slaState(ticket);
                                const state = TICKET_STATES[ticket.status] ?? TICKET_STATES.open;
                                const priority = PRIORITIES[ticket.priority || 'normal'];

                                return (
                                    <li key={ticket.ticket} className={sla.breached ? 'is-breached' : ''}>
                                        <button
                                            type="button"
                                            className="sa-row"
                                            onClick={() => openTicket(ticket)}
                                            aria-label={`Open ticket ${ticket.ticket}`}
                                        >
                                            <span className="sa-avatar" aria-hidden="true">
                                                {initials(ticket.name)}
                                            </span>

                                            <span className="sa-row-main">
                                                <span className="sa-row-top">
                                                    <strong>{ticket.name || 'Anonymous'}</strong>
                                                    <span className={`sa-pill is-${priority.tone}`}>{priority.label}</span>
                                                    {ticket.replies?.length > 0 && (
                                                        <span className="sa-replies" title={`${ticket.replies.length} replies`}>
                                                            <i className="bi bi-reply-fill" aria-hidden="true" />
                                                            {ticket.replies.length}
                                                        </span>
                                                    )}
                                                </span>

                                                <span className="sa-row-msg">{ticket.message}</span>

                                                <span className="sa-row-meta">
                                                    {ticket.ticket} · {TOPICS[ticket.topic] || ticket.topic}
                                                    {ticket.orderNumber ? ` · ${ticket.orderNumber}` : ''} ·{' '}
                                                    {relative(ticket.sentAt)}
                                                    {ticket.assignee && ticket.assignee !== 'Unassigned' && (
                                                        <span className="sa-assignee">
                                                            <i className="bi bi-person-check" aria-hidden="true" />
                                                            {ticket.assignee}
                                                        </span>
                                                    )}
                                                </span>
                                            </span>

                                            <span className="sa-row-side">
                                                <span className={`sa-status is-${state.tone}`}>
                                                    <span className="sa-status-dot" aria-hidden="true" />
                                                    {state.label}
                                                </span>

                                                {sla.breached && (
                                                    <span className="sa-breach">
                                                        <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
                                                        {Math.floor(hoursOpen(ticket))}h open
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>

                        <AdminPager
                            page={safePage}
                            totalPages={totalPages}
                            totalItems={filtered.length}
                            pageSize={pageSize}
                            onPage={setPage}
                            onPageSize={setPageSize}
                            label="tickets"
                        />
                    </>
                )}
            </section>

            {/* ---------------------------- thread ---------------------------- */}
            <AdminModal
                open={Boolean(active)}
                onClose={() => setActive(null)}
                title={active?.ticket || ''}
                subtitle={
                    active
                        ? `${active.name || 'Anonymous'} · ${active.email || 'no email'} · ${relative(active.sentAt)}`
                        : ''
                }
                icon="bi-life-preserver"
                size="md"
                footer={
                    active?.status === 'closed' ? (
                        <>
                            <button
                                type="button"
                                className="am-btn is-plain"
                                onClick={() => setConfirmDelete(active)}
                            >
                                Delete
                            </button>
                            <button
                                type="button"
                                className="am-btn is-ghost"
                                onClick={() => reopenTicket(active.ticket)}
                            >
                                Reopen
                            </button>
                            <button type="button" className="am-btn" onClick={() => setActive(null)}>
                                Close
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="am-btn is-plain"
                                onClick={() => {
                                    closeTicket(active.ticket);
                                    setActive(null);
                                }}
                            >
                                Resolve without reply
                            </button>
                            <button type="button" className="am-btn is-ghost" onClick={() => send(true)}>
                                Reply &amp; close
                            </button>
                            <button type="button" className="am-btn" onClick={() => send(false)}>
                                <i className="bi bi-send" aria-hidden="true" />
                                Send reply
                            </button>
                        </>
                    )
                }
            >
                {active && (
                    <div className="sa-thread">
                        <div className="sa-controls">
                            <label className="sa-control">
                                <span>Priority</span>
                                <select
                                    value={active.priority || 'normal'}
                                    onChange={(event) => setPriority(active.ticket, event.target.value)}
                                >
                                    {Object.entries(PRIORITIES).map(([id, meta]) => (
                                        <option key={id} value={id}>
                                            {meta.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="sa-control">
                                <span>Assigned to</span>
                                <select
                                    value={active.assignee || 'Unassigned'}
                                    onChange={(event) => assignTicket(active.ticket, event.target.value)}
                                >
                                    {AGENTS.map((agent) => (
                                        <option key={agent} value={agent}>
                                            {agent}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        {active.orderNumber && (
                            <div className="am-notice is-info">
                                <i className="bi bi-box-seam" aria-hidden="true" />
                                Refers to order <strong>{active.orderNumber}</strong>
                            </div>
                        )}

                        <ul className="sa-messages">
                            <li className="is-customer">
                                <span className="sa-msg-who">
                                    {active.name || 'Customer'} · {relative(active.sentAt)}
                                </span>
                                <p>{active.message}</p>
                            </li>

                            {(active.replies || []).map((reply) => (
                                <li className="is-staff" key={reply.id}>
                                    <span className="sa-msg-who">
                                        {reply.author} · {relative(reply.at)}
                                    </span>
                                    <p>{reply.body}</p>
                                </li>
                            ))}
                        </ul>

                        {active.status !== 'closed' && (
                            <div className="am-field is-full">
                                <label htmlFor="sa-reply">Your reply</label>
                                <textarea
                                    id="sa-reply"
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    placeholder="Write a reply — the customer sees this on the Support page."
                                    rows={4}
                                />
                                <span className="am-hint">
                                    There is no mail server in this demo, so the reply is delivered in-app.
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </AdminModal>

            {/* ---------------------------- deletion --------------------------- */}
            <ConfirmDialog
                open={Boolean(confirmDelete)}
                onClose={() => setConfirmDelete(null)}
                onConfirm={() => {
                    deleteTicket(confirmDelete.ticket);
                    setConfirmDelete(null);
                    setActive(null);
                }}
                title="Delete this ticket?"
                message="The conversation disappears for the customer too. You can undo this from the toast that follows."
                confirmLabel="Delete ticket"
                cancelLabel="Keep it"
                footnote="Undo available for 8 seconds"
            >
                {confirmDelete && (
                    <div className="am-preview">
                        <span className="am-preview-info">
                            <span className="am-preview-tag is-out">{confirmDelete.ticket}</span>
                            <strong>{confirmDelete.name || 'Anonymous'}</strong>
                            <span className="am-preview-meta">{confirmDelete.email || 'no email'}</span>
                        </span>
                    </div>
                )}
            </ConfirmDialog>
        </div>
    );
};

export default AdminSupport;
