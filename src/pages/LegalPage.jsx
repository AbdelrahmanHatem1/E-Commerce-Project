import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link, useLocation } from 'react-router-dom';
import './LegalPage.css';

/* Both legal documents share one component. `kind` decides which
   content set renders, so /privacy and /terms stay in sync visually. */
const CONTENT = {
    privacy: {
        title: 'Privacy Policy',
        icon: 'bi-shield-lock',
        intro:
            'This policy explains what ShopStream collects, why we collect it, and the control you have over your information.',
        sections: [
            {
                id: 'collect',
                heading: 'What we collect',
                body: [
                    'Account details you give us directly: your name, email address, phone number and shipping address.',
                    'Order information: the products you buy, the amount paid and the address a parcel is sent to.',
                    'Device data stored locally in your browser: your cart, wishlist, recently viewed products, chosen currency and theme. This never leaves your device unless you place an order.',
                ],
            },
            {
                id: 'use',
                heading: 'How we use it',
                body: [
                    'To process and deliver your orders, and to send the confirmation email that follows.',
                    'To pre-fill checkout so you do not retype an address you have already saved.',
                    'To answer support requests. When you contact us we keep the message and your reply address only for as long as the conversation needs.',
                ],
            },
            {
                id: 'storage',
                heading: 'Where it lives',
                body: [
                    'Your session is kept in your browser. Choosing "Remember me" stores it in localStorage so it survives a restart; leaving it unticked uses sessionStorage, which clears when you close the tab.',
                    'Signing out removes the session and any stored order confirmation from that device immediately.',
                    'Account Settings has a "Clear local data" button that erases your wishlist, browsing history and locally stored orders in one action.',
                ],
            },
            {
                id: 'sharing',
                heading: 'Who we share it with',
                body: [
                    'We do not sell your personal information.',
                    'Delivery partners receive only the address details needed to complete a shipment.',
                    'Payment details are handled by the payment provider. ShopStream never stores your full card number — only the last four digits, so you can recognise the card on an order.',
                ],
            },
            {
                id: 'rights',
                heading: 'Your rights',
                body: [
                    'You can view and edit your details at any time from your account.',
                    'You may request a copy of your data, or ask us to delete it, by contacting support.',
                    'You can withdraw marketing consent by unsubscribing from any email we send.',
                ],
            },
            {
                id: 'cookies',
                heading: 'Cookies and local storage',
                body: [
                    'We use browser storage rather than tracking cookies. Nothing we store is used to profile you across other websites.',
                    'Clearing your browser data removes these values and resets the store to its default state.',
                ],
            },
        ],
    },
    terms: {
        title: 'Terms of Service',
        icon: 'bi-file-earmark-text',
        intro:
            'These terms govern your use of ShopStream. By placing an order you agree to them, so please read them before you buy.',
        sections: [
            {
                id: 'account',
                heading: 'Your account',
                body: [
                    'You must provide accurate details when registering, and keep your password confidential.',
                    'You are responsible for activity that happens under your account. Tell us straight away if you believe someone else has access.',
                    'We may suspend an account that is used for fraud or that repeatedly breaches these terms.',
                ],
            },
            {
                id: 'orders',
                heading: 'Orders and pricing',
                body: [
                    'An order is an offer to buy. It is accepted once we send your confirmation email with an order reference.',
                    'Prices are shown in your selected currency. Conversions are indicative and the charge is settled in the store currency at the rate applied by your payment provider.',
                    'Some products carry a minimum order quantity, which is displayed on the product page before you add it to your cart.',
                    'If a pricing or stock error is discovered after you order, we will contact you and offer to fulfil at the correct price or cancel for a full refund.',
                ],
            },
            {
                id: 'shipping',
                heading: 'Delivery',
                body: [
                    'Delivery estimates are calculated from the dispatch time of the slowest item in your basket and are not guaranteed dates.',
                    'Risk passes to you on delivery. Please inspect a parcel and tell us within 48 hours if it arrives damaged.',
                ],
            },
            {
                id: 'returns',
                heading: 'Returns and refunds',
                body: [
                    'Most items may be returned within 30 days of delivery. The exact window is printed on each product page.',
                    'Returned goods must be unused and in their original packaging. Personalised or hygiene items may be excluded.',
                    'Approved refunds are issued to the original payment method within 5-7 business days of the item reaching us.',
                ],
            },
            {
                id: 'conduct',
                heading: 'Acceptable use',
                body: [
                    'Do not attempt to disrupt the service, scrape it at scale, or resell content without permission.',
                    'Reviews and messages you submit must be your own and must not contain unlawful or abusive material.',
                ],
            },
            {
                id: 'liability',
                heading: 'Liability',
                body: [
                    'The store is provided as is. Product imagery and descriptions come from our catalogue provider and may differ slightly from the item you receive.',
                    'Nothing in these terms limits rights you have under consumer law in your country.',
                ],
            },
            {
                id: 'changes',
                heading: 'Changes to these terms',
                body: [
                    'We may update these terms as the service evolves. The revision date at the top of this page always reflects the current version.',
                    'Continuing to use ShopStream after an update means you accept the revised terms.',
                ],
            },
        ],
    },
};

const LegalPage = ({ kind = 'privacy' }) => {
    const location = useLocation();
    const doc = CONTENT[kind] ?? CONTENT.privacy;
    const other = kind === 'privacy' ? CONTENT.terms : CONTENT.privacy;
    const otherPath = kind === 'privacy' ? '/terms' : '/privacy';

    const [activeSection, setActiveSection] = useState(doc.sections[0]?.id);
    const [progress, setProgress] = useState(0);
    const [copied, setCopied] = useState(false);
    const sectionRefs = useRef({});

    /* Roughly 200 words a minute over the whole document. */
    const readingTime = useMemo(() => {
        const words = doc.sections.reduce(
            (sum, section) => sum + section.body.join(' ').split(/\s+/).length,
            0
        );
        return Math.max(1, Math.round(words / 200));
    }, [doc]);

    const updated = useMemo(
        () =>
            new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        []
    );

    useEffect(() => {
        document.title = `${doc.title} · ShopStream`;
        window.scrollTo({ top: 0, behavior: 'smooth' });

        return () => {
            document.title = 'ShopStream';
        };
    }, [doc.title]);

    /* A thin bar showing how far through the document you are. */
    useEffect(() => {
        const onScroll = () => {
            const scrollable = document.documentElement.scrollHeight - window.innerHeight;
            setProgress(scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0);
        };

        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [kind]);

    /* Highlight whichever section is currently on screen. */
    useEffect(() => {
        /* Older browsers and non-DOM environments lack it; the feature is
           progressive so simply skipping is correct. */
        if (typeof IntersectionObserver === 'undefined') return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

                if (visible) setActiveSection(visible.target.id);
            },
            { rootMargin: '-96px 0px -70% 0px' }
        );

        Object.values(sectionRefs.current).forEach((node) => {
            if (node) observer.observe(node);
        });

        return () => observer.disconnect();
    }, [kind]);

    /* Deep links such as /terms#returns land on the right heading. */
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

    const jumpTo = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    /* Deep-link to the exact clause someone is asking about. */
    const copySectionLink = async (id) => {
        const url = `${window.location.origin}${window.location.pathname}#${id}`;

        try {
            await navigator.clipboard.writeText(url);
            setCopied(id);
            setTimeout(() => setCopied(false), 1800);
        } catch (error) {
            console.error('Clipboard unavailable:', error);
        }
    };

    return (
        <main className="lg-page">
            <div
                className="lg-progress"
                style={{ transform: `scaleX(${progress / 100})` }}
                aria-hidden="true"
            />

            <div className="lg-shell">
                <nav className="lg-breadcrumb" aria-label="Breadcrumb">
                    <Link to="/">Home</Link>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                    <span>{doc.title}</span>
                </nav>

                <header className="lg-header">
                    <span className="lg-header-icon" aria-hidden="true">
                        <i className={`bi ${doc.icon}`} />
                    </span>

                    <div>
                        <h1>{doc.title}</h1>
                        <p>{doc.intro}</p>
                        <div className="lg-header-meta">
                            <span className="lg-updated">
                                <i className="bi bi-clock-history" aria-hidden="true" />
                                Last updated {updated}
                            </span>
                            <span className="lg-reading">
                                <i className="bi bi-book" aria-hidden="true" />
                                {readingTime} min read
                            </span>
                            <button type="button" className="lg-print" onClick={() => window.print()}>
                                <i className="bi bi-printer" aria-hidden="true" />
                                Print
                            </button>
                        </div>
                    </div>
                </header>

                <div className="lg-layout">
                    {/* --------------------------- index --------------------------- */}
                    <aside className="lg-toc" aria-label="On this page">
                        <h2>On this page</h2>

                        <nav>
                            {doc.sections.map((section) => (
                                <button
                                    type="button"
                                    key={section.id}
                                    className={activeSection === section.id ? 'is-active' : ''}
                                    onClick={() => jumpTo(section.id)}
                                >
                                    {section.heading}
                                </button>
                            ))}
                        </nav>

                        <div className="lg-toc-foot">
                            <Link to={otherPath}>
                                <i className={`bi ${other.icon}`} aria-hidden="true" />
                                {other.title}
                            </Link>
                            <Link to="/support">
                                <i className="bi bi-headset" aria-hidden="true" />
                                Contact support
                            </Link>
                        </div>
                    </aside>

                    {/* -------------------------- document ------------------------- */}
                    <article className="lg-doc">
                        {doc.sections.map((section, index) => (
                            <section
                                className="lg-section"
                                id={section.id}
                                key={section.id}
                                ref={(node) => {
                                    sectionRefs.current[section.id] = node;
                                }}
                            >
                                <h2>
                                    <span className="lg-section-number">{String(index + 1).padStart(2, '0')}</span>
                                    {section.heading}
                                    <button
                                        type="button"
                                        className="lg-anchor"
                                        onClick={() => copySectionLink(section.id)}
                                        aria-label={`Copy a link to "${section.heading}"`}
                                        title="Copy link to this section"
                                    >
                                        <i
                                            className={`bi ${copied === section.id ? 'bi-check2' : 'bi-link-45deg'}`}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </h2>

                                {section.body.map((paragraph) => (
                                    <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                                ))}
                            </section>
                        ))}

                        <footer className="lg-doc-foot">
                            <div>
                                <h3>Still have a question?</h3>
                                <p>Our team can walk you through anything on this page.</p>
                            </div>
                            <Link to="/support">Contact support</Link>
                        </footer>
                    </article>
                </div>
            </div>
        </main>
    );
};

export default LegalPage;
