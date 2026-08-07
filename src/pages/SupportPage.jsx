import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext.jsx';
import { useNotification } from '../components/Notification.jsx';
import { useSupport, TICKET_STATES } from '../contexts/SupportContext.jsx';
import './SupportPage.css';
import { writeJson } from '../lib/storage.js';

const ORDER_HISTORY_KEY = 'shopstream_order_history';
const HELPFUL_KEY = 'shopstream_faq_votes';
const SUPPORT_EMAIL = 'support@shopstream.com';

/* Support runs around the clock, but a human replies faster in these
   hours. Shown live so the promise on the page is never stale. */
const isPeakHours = () => {
    const hour = new Date().getHours();
    return hour >= 9 && hour < 21;
};

const readJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : fallback;
        return parsed ?? fallback;
    } catch (error) {
        console.error(`Failed to read ${key}:`, error);
        return fallback;
    }
};

const TOPICS = [
    { id: 'order', label: 'Order issue', icon: 'bi-bag-check' },
    { id: 'shipping', label: 'Shipping & delivery', icon: 'bi-truck' },
    { id: 'returns', label: 'Returns & refunds', icon: 'bi-arrow-counterclockwise' },
    { id: 'payment', label: 'Payment', icon: 'bi-credit-card' },
    { id: 'account', label: 'Account', icon: 'bi-person-gear' },
    { id: 'other', label: 'Something else', icon: 'bi-chat-dots' },
];

/* Grouped so the page can jump to #shipping / #returns / #faq, which is
   exactly what the Footer links point at. */
const FAQ_SECTIONS = [
    {
        id: 'shipping',
        title: 'Shipping & delivery',
        icon: 'bi-truck',
        items: [
            {
                q: 'How long will my order take to arrive?',
                a: 'Most orders are dispatched within 24 hours and arrive in 3-5 business days. Each product page shows its own dispatch estimate, and the slowest item in your basket sets the delivery date you see at checkout.',
            },
            {
                q: 'Do you offer free shipping?',
                a: 'Yes. Express delivery is free on every order with no minimum spend. You will see the shipping line marked FREE in your order summary before you pay.',
            },
            {
                q: 'Can I track my package?',
                a: 'Open your account, go to Order History and expand any order. The status moves from Placed to Processing to Shipped to Delivered as your parcel progresses.',
            },
            {
                q: 'Do you ship internationally?',
                a: 'We currently ship to the countries listed in the checkout dropdown, including Egypt, Saudi Arabia and the UAE. Duties are calculated at checkout where applicable.',
            },
        ],
    },
    {
        id: 'returns',
        title: 'Returns & refunds',
        icon: 'bi-arrow-counterclockwise',
        items: [
            {
                q: 'What is your return window?',
                a: 'Most items carry a 30-day return policy from the delivery date. Some products differ — the exact policy is printed on every product page under the price.',
            },
            {
                q: 'How do I start a return?',
                a: 'Contact us with your order number using the form below and we will send a prepaid label. Items must be unused and in their original packaging.',
            },
            {
                q: 'When will I get my refund?',
                a: 'Refunds are issued to the original payment method within 5-7 business days of us receiving the item back.',
            },
        ],
    },
    {
        id: 'faq',
        title: 'Orders & payment',
        icon: 'bi-credit-card',
        items: [
            {
                q: 'Which payment methods do you accept?',
                a: 'Visa, Mastercard and PayPal. Every transaction runs over a 256-bit SSL connection and we never store your full card number.',
            },
            {
                q: 'Can I change or cancel an order?',
                a: 'If the order is still marked Processing, contact us straight away and we will amend it. Once it ships you can use the standard return process instead.',
            },
            {
                q: 'Why do some items have a minimum order quantity?',
                a: 'A few products ship in wholesale packs. When that applies you will see a note under the stock line telling you the minimum number of units.',
            },
            {
                q: 'Do you offer a warranty?',
                a: 'Warranty length varies by product and is shown on each product page. It covers manufacturing defects, not accidental damage.',
            },
        ],
    },
    {
        id: 'account',
        title: 'Account & privacy',
        icon: 'bi-shield-lock',
        items: [
            {
                q: 'How do I change my details?',
                a: 'Sign in, open your account and choose My Details. Your saved address is used to pre-fill checkout automatically.',
            },
            {
                q: 'How is my data handled?',
                a: 'We only store what is needed to fulfil your orders. Read the full breakdown in our Privacy Policy.',
            },
            {
                q: 'Can I delete my saved data?',
                a: 'Yes. Account Settings has a Clear local data button that removes your wishlist, browsing history and locally stored orders from this device.',
            },
        ],
    },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const readOrders = () => {
    const list = readJson(ORDER_HISTORY_KEY, []);
    return Array.isArray(list) ? list : [];
};

const SupportPage = () => {
    const { user } = useContext(AuthContext);
    const { notify } = useNotification();
    const location = useLocation();

    const orders = useMemo(() => readOrders(), []);

    const [query, setQuery] = useState('');
    const [openItem, setOpenItem] = useState(null);
    const [sent, setSent] = useState(false);
    const [sending, setSending] = useState(false);

    /* Tickets were being written and never read — now they have a home. */
    /* Tickets now live in SupportContext so the admin inbox and this
       page read the same records — replies land here automatically. */
    const { tickets, createTicket, closeTicket } = useSupport();
    const [votes, setVotes] = useState(() => readJson(HELPFUL_KEY, {}));
    const [peak, setPeak] = useState(() => isPeakHours());

    const formRef = useRef(null);
    const ticketsRef = useRef(null);

    const [form, setForm] = useState({
        name: '',
        email: '',
        topic: 'order',
        orderNumber: '',
        message: '',
    });

    useEffect(() => {
        document.title = 'Support · ShopStream';
        return () => {
            document.title = 'ShopStream';
        };
    }, []);

    /* Re-check the clock every minute so the badge cannot go stale. */
    useEffect(() => {
        const timer = setInterval(() => setPeak(isPeakHours()), 60_000);
        return () => clearInterval(timer);
    }, []);

    /* Prefill from the signed-in account. */
    useEffect(() => {
        if (!user) return;
        setForm((prev) => ({
            ...prev,
            name: prev.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            email: prev.email || user.email || '',
        }));
    }, [user]);

    /* The Footer links to /support#shipping and friends. */
    useEffect(() => {
        if (!location.hash) return undefined;

        const target = document.getElementById(location.hash.slice(1));
        if (!target) return undefined;

        /* The delay lets the section finish laying out before we scroll to
           it. Cleared on unmount: navigating away inside 120ms otherwise
           leaves a timer that scrolls a page the visitor has already left. */
        const timer = setTimeout(
            () => target.scrollIntoView({ behavior: 'smooth' }),
            120
        );

        return () => clearTimeout(timer);
    }, [location.hash]);

    /* Live filter across every question and answer. */
    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return FAQ_SECTIONS;

        return FAQ_SECTIONS.map((section) => ({
            ...section,
            items: section.items.filter(
                (item) =>
                    item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term)
            ),
        })).filter((section) => section.items.length > 0);
    }, [query]);

    const resultCount = filtered.reduce((sum, section) => sum + section.items.length, 0);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const jumpToForm = (topic) => {
        setForm((prev) => ({ ...prev, topic }));
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!form.name.trim()) {
            notify.error('Missing name', 'Please tell us who you are.');
            return;
        }

        if (!EMAIL_PATTERN.test(form.email)) {
            notify.error('Invalid email', 'We need a valid address to reply to.');
            return;
        }

        if (form.message.trim().length < 15) {
            notify.error('Message too short', 'Give us a little more detail so we can help.');
            return;
        }

        setSending(true);

        /* No ticketing backend exists, so the request is queued locally and
           the visitor gets a real reference they can quote. */
        await new Promise((resolve) => setTimeout(resolve, 800));

        const record = createTicket(form);

        setSending(false);
        setSent(record.ticket);
        notify.success(
            `Ticket ${record.ticket} created.`,
            'Our team replies here on this page — check back shortly.'
        );
    };

    /* One vote per question, stored so it survives a reload. */
    const voteHelpful = (key, value) => {
        const next = { ...votes, [key]: value };
        setVotes(next);
        writeJson(HELPFUL_KEY, next);

        notify[value === 'yes' ? 'success' : 'info'](
            value === 'yes'
                ? 'Thanks — glad that helped.'
                : 'Sorry about that. Send us a message and we will explain properly.'
        );
    };

    const copyTicket = async (ticket) => {
        try {
            await navigator.clipboard.writeText(ticket);
            notify.success(`Reference ${ticket} copied.`);
        } catch (error) {
            console.error('Clipboard unavailable:', error);
            notify.info(`Your reference is ${ticket}.`);
        }
    };

    const openMailClient = () => {
        const subject = encodeURIComponent(`Support request${form.orderNumber ? ` — ${form.orderNumber}` : ''}`);
        window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
    };

    return (
        <main className="sp-page">
            <div className="sp-shell">
                <nav className="sp-breadcrumb" aria-label="Breadcrumb">
                    <Link to="/">Home</Link>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                    <span>Support</span>
                </nav>

                {/* ------------------------------ hero ----------------------------- */}
                <header className="sp-hero">
                    <span className={`sp-hero-badge ${peak ? 'is-peak' : ''}`}>
                        <span className="sp-live-dot" aria-hidden="true" />
                        {peak ? 'Team online — replies in ~1 hour' : 'Off-peak — replies within 8 hours'}
                    </span>

                    <h1>How can we help?</h1>
                    <p>Search our answers, or send us a message and we will reply by email.</p>

                    <div className="sp-search">
                        <i className="bi bi-search" aria-hidden="true" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search help articles…"
                            aria-label="Search help articles"
                        />
                        {query && (
                            <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                                <i className="bi bi-x-lg" aria-hidden="true" />
                            </button>
                        )}
                    </div>

                    {query && (
                        <p className="sp-result-count">
                            {resultCount === 0
                                ? 'No articles matched — try the contact form below.'
                                : `${resultCount} article${resultCount === 1 ? '' : 's'} found`}
                        </p>
                    )}
                </header>

                {/* ---------------------------- channels --------------------------- */}
                <section className="sp-channels" aria-label="Contact channels">
                    <button type="button" className="sp-channel" onClick={() => jumpToForm('other')}>
                        <span className="sp-channel-icon is-chat" aria-hidden="true">
                            <i className="bi bi-chat-square-text-fill" />
                        </span>
                        <strong>Send a message</strong>
                        <small>Typical reply within 4 hours</small>
                    </button>

                    <button type="button" className="sp-channel" onClick={openMailClient}>
                        <span className="sp-channel-icon is-mail" aria-hidden="true">
                            <i className="bi bi-envelope-fill" />
                        </span>
                        <strong>Email us</strong>
                        <small>{SUPPORT_EMAIL}</small>
                    </button>

                    <Link to="/orders" className="sp-channel">
                        <span className="sp-channel-icon is-order" aria-hidden="true">
                            <i className="bi bi-box-seam-fill" />
                        </span>
                        <strong>Track an order</strong>
                        <small>See status and history</small>
                    </Link>

                    {tickets.length > 0 ? (
                        <button
                            type="button"
                            className="sp-channel"
                            onClick={() => ticketsRef.current?.scrollIntoView({ behavior: 'smooth' })}
                        >
                            <span className="sp-channel-icon is-ticket" aria-hidden="true">
                                <i className="bi bi-ticket-detailed-fill" />
                            </span>
                            <strong>My tickets</strong>
                            <small>
                                {tickets.filter((item) => item.status === 'open').length} open ·{' '}
                                {tickets.length} total
                            </small>
                        </button>
                    ) : (
                        <button type="button" className="sp-channel" onClick={() => jumpToForm('returns')}>
                            <span className="sp-channel-icon is-return" aria-hidden="true">
                                <i className="bi bi-arrow-counterclockwise" />
                            </span>
                            <strong>Start a return</strong>
                            <small>30-day window on most items</small>
                        </button>
                    )}
                </section>

                <div className="sp-layout">
                    {/* ------------------------------ FAQ ---------------------------- */}
                    <div className="sp-faq">
                        {filtered.length === 0 ? (
                            <div className="sp-no-results">
                                <i className="bi bi-search" aria-hidden="true" />
                                <h2>Nothing matched &ldquo;{query}&rdquo;</h2>
                                <p>Try a different word, or ask us directly.</p>
                                <button type="button" onClick={() => jumpToForm('other')}>
                                    Contact support
                                </button>
                            </div>
                        ) : (
                            filtered.map((section) => (
                                <section className="sp-faq-block" id={section.id} key={section.id}>
                                    <h2>
                                        <i className={`bi ${section.icon}`} aria-hidden="true" />
                                        {section.title}
                                    </h2>

                                    <div className="sp-faq-list">
                                        {section.items.map((item) => {
                                            const key = `${section.id}-${item.q}`;
                                            const open = openItem === key;

                                            return (
                                                <article className={`sp-faq-item ${open ? 'is-open' : ''}`} key={key}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenItem(open ? null : key)}
                                                        aria-expanded={open}
                                                    >
                                                        <span>{item.q}</span>
                                                        <i
                                                            className={`bi ${open ? 'bi-dash-lg' : 'bi-plus-lg'}`}
                                                            aria-hidden="true"
                                                        />
                                                    </button>

                                                    {open && (
                                                        <div className="sp-faq-body">
                                                            <p>{item.a}</p>

                                                            <div className="sp-helpful">
                                                                {votes[key] ? (
                                                                    <span className="sp-voted">
                                                                        <i className="bi bi-check2" aria-hidden="true" />
                                                                        Thanks for the feedback
                                                                    </span>
                                                                ) : (
                                                                    <>
                                                                        <span>Was this helpful?</span>
                                                                        <button type="button" onClick={() => voteHelpful(key, 'yes')}>
                                                                            <i className="bi bi-hand-thumbs-up" aria-hidden="true" />
                                                                            Yes
                                                                        </button>
                                                                        <button type="button" onClick={() => voteHelpful(key, 'no')}>
                                                                            <i className="bi bi-hand-thumbs-down" aria-hidden="true" />
                                                                            No
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </article>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))
                        )}

                        {/* ------------------------- my tickets ------------------------ */}
                        {tickets.length > 0 && (
                            <section className="sp-tickets" ref={ticketsRef} id="tickets">
                                <h2>
                                    <i className="bi bi-ticket-detailed" aria-hidden="true" />
                                    My tickets
                                </h2>

                                <ul className="sp-ticket-list">
                                    {tickets.map((item) => {
                                        const topic = TOPICS.find((entry) => entry.id === item.topic);

                                        return (
                                            <li className={`sp-ticket is-${item.status}`} key={item.ticket}>
                                                <div className="sp-ticket-head">
                                                    <span className="sp-ticket-id">
                                                        <i className={`bi ${topic?.icon || 'bi-chat-dots'}`} aria-hidden="true" />
                                                        {item.ticket}
                                                    </span>

                                                    <span className={`sp-ticket-status is-${item.status}`}>
                                                        {TICKET_STATES[item.status]?.label ?? 'Open'}
                                                    </span>
                                                </div>

                                                <p className="sp-ticket-message">{item.message}</p>

                                                {/* Staff replies — this is what the whole admin
                            inbox exists to deliver. */}
                                                {(item.replies || []).map((reply) => (
                                                    <div className="sp-ticket-reply" key={reply.id}>
                                                        <span className="sp-reply-who">
                                                            <i className="bi bi-headset" aria-hidden="true" />
                                                            {reply.author} replied
                                                        </span>
                                                        <p>{reply.body}</p>
                                                    </div>
                                                ))}

                                                <div className="sp-ticket-foot">
                                                    <span>
                                                        {topic?.label}
                                                        {item.orderNumber && ` · ${item.orderNumber}`} ·{' '}
                                                        {new Date(item.sentAt).toLocaleDateString('en-US', {
                                                            month: 'short',
                                                            day: 'numeric',
                                                        })}
                                                    </span>

                                                    <div className="sp-ticket-actions">
                                                        <button type="button" onClick={() => copyTicket(item.ticket)}>
                                                            <i className="bi bi-clipboard" aria-hidden="true" />
                                                            Copy ref
                                                        </button>
                                                        {item.status !== 'closed' && (
                                                            <button type="button" onClick={() => closeTicket(item.ticket)}>
                                                                <i className="bi bi-check2-circle" aria-hidden="true" />
                                                                Resolved
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        )}
                    </div>

                    {/* ---------------------------- contact -------------------------- */}
                    <aside className="sp-contact" ref={formRef} id="contact">
                        {sent ? (
                            <div className="sp-sent">
                                <span className="sp-sent-icon" aria-hidden="true">
                                    <i className="bi bi-check-lg" />
                                </span>
                                <h2>Message received</h2>
                                <p>
                                    Your reference is <strong>{sent}</strong>. We will reply to{' '}
                                    <strong>{form.email}</strong> shortly.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSent(false);
                                        setForm((prev) => ({ ...prev, message: '', orderNumber: '' }));
                                    }}
                                >
                                    Send another message
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} noValidate>
                                <h2>Contact us</h2>
                                <p className="sp-contact-note">
                                    {user
                                        ? 'We filled in your account details — just add the question.'
                                        : 'Fill this in and we will get back to you by email.'}
                                </p>

                                <div className="sp-field">
                                    <label htmlFor="sp-name">Your name</label>
                                    <input
                                        id="sp-name"
                                        name="name"
                                        value={form.name}
                                        onChange={handleChange}
                                        placeholder="Jane Doe"
                                        autoComplete="name"
                                    />
                                </div>

                                <div className="sp-field">
                                    <label htmlFor="sp-email">Email</label>
                                    <input
                                        id="sp-email"
                                        name="email"
                                        type="email"
                                        value={form.email}
                                        onChange={handleChange}
                                        placeholder="jane@example.com"
                                        autoComplete="email"
                                    />
                                </div>

                                <div className="sp-field">
                                    <label htmlFor="sp-topic">Topic</label>
                                    <div className="sp-select-wrap">
                                        <select id="sp-topic" name="topic" value={form.topic} onChange={handleChange}>
                                            {TOPICS.map((topic) => (
                                                <option key={topic.id} value={topic.id}>
                                                    {topic.label}
                                                </option>
                                            ))}
                                        </select>
                                        <i className="bi bi-chevron-down" aria-hidden="true" />
                                    </div>
                                </div>

                                {/* Real orders become a dropdown instead of free text. */}
                                {(form.topic === 'order' || form.topic === 'returns') && (
                                    <div className="sp-field">
                                        <label htmlFor="sp-order">Order number</label>
                                        {orders.length > 0 ? (
                                            <div className="sp-select-wrap">
                                                <select
                                                    id="sp-order"
                                                    name="orderNumber"
                                                    value={form.orderNumber}
                                                    onChange={handleChange}
                                                >
                                                    <option value="">Select an order…</option>
                                                    {orders.map((order) => (
                                                        <option key={order.orderNumber} value={order.orderNumber}>
                                                            {order.orderNumber}
                                                        </option>
                                                    ))}
                                                </select>
                                                <i className="bi bi-chevron-down" aria-hidden="true" />
                                            </div>
                                        ) : (
                                            <input
                                                id="sp-order"
                                                name="orderNumber"
                                                value={form.orderNumber}
                                                onChange={handleChange}
                                                placeholder="SS-00209"
                                            />
                                        )}
                                    </div>
                                )}

                                <div className="sp-field">
                                    <label htmlFor="sp-message">How can we help?</label>
                                    <textarea
                                        id="sp-message"
                                        name="message"
                                        rows={5}
                                        value={form.message}
                                        onChange={handleChange}
                                        placeholder="Tell us what happened…"
                                    />
                                    <span className="sp-counter">{form.message.trim().length} / 15 min</span>
                                </div>

                                <button type="submit" className="sp-submit" disabled={sending}>
                                    {sending ? (
                                        <>
                                            <span className="sp-spinner" aria-hidden="true" />
                                            Sending…
                                        </>
                                    ) : (
                                        <>
                                            <i className="bi bi-send" aria-hidden="true" />
                                            Send message
                                        </>
                                    )}
                                </button>

                                <p className="sp-privacy-note">
                                    <i className="bi bi-shield-check" aria-hidden="true" />
                                    We only use your details to answer this request. See our{' '}
                                    <Link to="/privacy">Privacy Policy</Link>.
                                </p>
                            </form>
                        )}
                    </aside>
                </div>
            </div>
        </main>
    );
};

export default SupportPage;
