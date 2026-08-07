import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNotification } from '../components/Notification.jsx';

const SupportContext = createContext();

export const SUPPORT_KEY = 'shopstream_support';

/* Tickets used to live inside SupportPage's own useState, which meant
   the admin had no way to read them and a customer never saw a reply.
   Hoisting them here gives both sides one source of truth. */

export const TICKET_STATES = {
    open: { label: 'Open', tone: 'wait' },
    answered: { label: 'Answered', tone: 'info' },
    closed: { label: 'Resolved', tone: 'ok' },
};

export const PRIORITIES = {
    low: { label: 'Low', tone: 'calm' },
    normal: { label: 'Normal', tone: 'info' },
    high: { label: 'High', tone: 'warn' },
    urgent: { label: 'Urgent', tone: 'bad' },
};

/* Topics the contact form offers. Mirrored here so the admin can
   filter without importing from a page component. */
export const TOPICS = {
    order: 'Order issue',
    returns: 'Returns & refunds',
    payment: 'Payment',
    account: 'Account',
    other: 'Something else',
};

/* Hours a ticket may sit unanswered before it counts as breached. */
export const SLA_HOURS = { urgent: 4, high: 12, normal: 24, low: 48 };

export const hoursOpen = (ticket) =>
    (Date.now() - new Date(ticket?.sentAt).getTime()) / 3_600_000;

export const slaState = (ticket) => {
    if (!ticket || ticket.status !== 'open') return { breached: false, ratio: 0 };

    /* An unrecognised priority must not produce NaN — that compares
       false against every threshold, so the ticket would silently never
       breach and quietly disappear from the "needs action" count. */
    const limit = SLA_HOURS[ticket.priority] ?? SLA_HOURS.normal;
    const elapsed = hoursOpen(ticket);
    const ratio = Number.isFinite(elapsed) ? elapsed / limit : 0;

    return { breached: ratio >= 1, ratio, limit };
};

const readTickets = () => {
    try {
        const raw = localStorage.getItem(SUPPORT_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Failed to read support tickets:', error);
        return [];
    }
};

export const SupportProvider = ({ children }) => {
    const { notify } = useNotification();
    const [tickets, setTickets] = useState(readTickets);

    const persist = useCallback((next) => {
        setTickets(next);
        try {
            localStorage.setItem(SUPPORT_KEY, JSON.stringify(next));
            return true;
        } catch (error) {
            console.error('Failed to save support tickets:', error);
            return false;
        }
    }, []);

    /* Keep other tabs in step. */
    useEffect(() => {
        const sync = (event) => {
            if (event.key === SUPPORT_KEY) setTickets(readTickets());
        };
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);

    /* ----------------------- customer actions ---------------------- */
    const createTicket = useCallback(
        (form) => {
            const ticket = `SUP-${Date.now().toString().slice(-6)}`;

            const record = {
                ticket,
                ...form,
                /* Payment and order problems cost money every hour they sit. */
                priority: form.topic === 'payment' || form.topic === 'order' ? 'high' : 'normal',
                status: 'open',
                replies: [],
                sentAt: new Date().toISOString(),
            };

            /* Cap the log so localStorage cannot grow without bound. */
            persist([record, ...tickets].slice(0, 50));
            return record;
        },
        [tickets, persist]
    );

    const closeTicket = useCallback(
        (ticket, silent = false) => {
            persist(
                tickets.map((item) =>
                    item.ticket === ticket
                        ? { ...item, status: 'closed', closedAt: new Date().toISOString() }
                        : item
                )
            );
            if (!silent) notify.info(`Ticket ${ticket} marked as resolved.`);
        },
        [tickets, persist, notify]
    );

    const reopenTicket = useCallback(
        (ticket) => {
            persist(
                tickets.map((item) =>
                    item.ticket === ticket ? { ...item, status: 'open', closedAt: null } : item
                )
            );
            notify.info(`Ticket ${ticket} reopened.`);
        },
        [tickets, persist, notify]
    );

    /* ------------------------- admin actions ----------------------- */
    const replyToTicket = useCallback(
        (ticket, body, { close = false, author = 'Support' } = {}) => {
            const text = (body || '').trim();
            if (!text) return false;

            const reply = { id: `r-${Date.now()}`, body: text, author, at: new Date().toISOString() };

            const ok = persist(
                tickets.map((item) =>
                    item.ticket === ticket
                        ? {
                            ...item,
                            replies: [...(item.replies || []), reply],
                            /* Replying answers it; closing is a separate decision so
                               a follow-up question does not resolve the ticket. */
                            status: close ? 'closed' : 'answered',
                            ...(close ? { closedAt: new Date().toISOString() } : {}),
                            answeredAt: item.answeredAt || new Date().toISOString(),
                        }
                        : item
                )
            );

            if (!ok) {
                notify.error('Storage full', 'The reply could not be saved on this device.');
                return false;
            }

            notify.success(
                close ? `Replied and closed ${ticket}.` : `Reply sent on ${ticket}.`,
                'The customer sees it on the Support page.'
            );
            return true;
        },
        [tickets, persist, notify]
    );

    const setPriority = useCallback(
        (ticket, priority) => {
            persist(
                tickets.map((item) => (item.ticket === ticket ? { ...item, priority } : item))
            );
            notify.success(`${ticket} set to ${PRIORITIES[priority]?.label ?? priority}.`);
        },
        [tickets, persist, notify]
    );

    const assignTicket = useCallback(
        (ticket, assignee) => {
            persist(
                tickets.map((item) => (item.ticket === ticket ? { ...item, assignee } : item))
            );
            notify.success(assignee ? `${ticket} assigned to ${assignee}.` : `${ticket} unassigned.`);
        },
        [tickets, persist, notify]
    );

    const deleteTicket = useCallback(
        (ticket) => {
            const removed = tickets.find((item) => item.ticket === ticket);
            persist(tickets.filter((item) => item.ticket !== ticket));

            notify.action(`${ticket} deleted.`, {
                label: 'Undo',
                type: 'success',
                duration: 8000,
                onAction: () => {
                    if (removed) persist([removed, ...readTickets()]);
                },
            });
        },
        [tickets, persist, notify]
    );

    const openCount = useMemo(
        () => tickets.filter((item) => item.status === 'open').length,
        [tickets]
    );

    const breachedCount = useMemo(
        () => tickets.filter((item) => slaState(item).breached).length,
        [tickets]
    );

    const value = useMemo(
        () => ({
            tickets,
            openCount,
            breachedCount,
            createTicket,
            closeTicket,
            reopenTicket,
            replyToTicket,
            setPriority,
            assignTicket,
            deleteTicket,
        }),
        [
            tickets,
            openCount,
            breachedCount,
            createTicket,
            closeTicket,
            reopenTicket,
            replyToTicket,
            setPriority,
            assignTicket,
            deleteTicket,
        ]
    );

    return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
};

export const useSupport = () => {
    const context = useContext(SupportContext);

    if (!context) {
        throw new Error('useSupport must be used inside <SupportProvider>.');
    }

    return context;
};

export default SupportContext;
