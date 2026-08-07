import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link } from 'react-router-dom';
import { useResolvedImage } from '../../lib/useResolvedImages.js';
import StoredImage from '../StoredImage.jsx';
import {
    sectionStyle, innerStyle, animationProps, visibilityClass, hasCustomBackground,
} from './blockStyles.js';
import './blockRenderer.css';

/* ----------------------------------------------------------------
   Draws one block for real.

   The same component renders the live storefront and the builder
   canvas. `editing` only adds the selection chrome — it never changes
   the output — so what the admin arranges is literally what ships.
   ---------------------------------------------------------------- */

/* Reveal on scroll. Reduced-motion visitors skip straight to visible,
   which is why the check happens here rather than in CSS alone. */
const useReveal = (enabled, once = true) => {
    const ref = useRef(null);
    const [visible, setVisible] = useState(!enabled);

    useEffect(() => {
        if (!enabled) {
            setVisible(true);
            return undefined;
        }

        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
            setVisible(true);
            return undefined;
        }

        const node = ref.current;
        if (!node || typeof IntersectionObserver === 'undefined') {
            setVisible(true);
            return undefined;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    if (once) observer.disconnect();
                } else if (!once) {
                    setVisible(false);
                }
            },
            { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [enabled, once]);

    return [ref, visible];
};

/* --------------------------- sub-renderers -------------------------- */

/* Shared button renderer so every block draws the same vocabulary. */
const ActionButton = ({ to, label, variant = 'solid', shape = 'pill', size = 'md', icon }) => (
    <Link to={to || '/'} className={`ssb-btn is-${variant} is-${shape} is-${size}`}>
        {icon && <i className={`bi ${icon}`} aria-hidden="true" />}
        {label || 'Button'}
    </Link>
);

/* The hero, rendered for real in both the builder and the storefront.
   It owns its slides, so what the admin types is what ships — the old
   version deferred to the hand-written HomePage markup and could only
   ever show a stand-in inside the canvas. */
const HeroBlock = ({ block, visible, products = [], format, editing }) => {
    const {
        slides = [], mediaSide = 'right', mediaSource = 'product', mediaShape = 'card',
        autoplay, interval = 6, showDots, showArrows, minHeight = 460,
        buttonStyle = 'solid', buttonShape = 'pill', buttonSize = 'md',
    } = block.props;

    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    const count = slides.length;
    const slide = slides[Math.min(index, Math.max(0, count - 1))];

    /* Deleting a slide while a later one is showing must not strand the
       index past the end of the array. */
    useEffect(() => {
        if (index > count - 1) setIndex(0);
    }, [count, index]);

    useEffect(() => {
        /* Rotation is paused inside the builder: a moving target is
           impossible to design against. */
        if (!autoplay || editing || paused || count < 2) return undefined;

        const id = setInterval(() => setIndex((i) => (i + 1) % count), interval * 1000);
        return () => clearInterval(id);
    }, [autoplay, editing, paused, count, interval]);

    /* One product per slide, picked deterministically so it does not
       change on every render. */
    const product = useMemo(() => {
        if (mediaSource !== 'product' || products.length === 0) return null;
        return products[index % products.length];
    }, [mediaSource, products, index]);

    const slideImage = useResolvedImage(slide?.image);

    if (!slide) {
        return (
            <div className="ssb-hero-empty">
                <i className="bi bi-easel2" aria-hidden="true" />
                <p>Add a slide to get started.</p>
            </div>
        );
    }

    const media =
        mediaSide === 'none' ? null : (
            <div className={`ssb-hero-media is-${mediaShape}`}>
                {mediaSource === 'custom' && slideImage ? (
                    <img src={slideImage} alt="" />
                ) : product ? (
                    <Link to={`/product/${product.id}`} className="ssb-hero-product">
                        <StoredImage src={product.thumbnail} alt={product.title} />
                        <span className="ssb-hero-tag">
                            {product.title} · {format ? format(product.price) : `$${product.price}`}
                        </span>
                    </Link>
                ) : (
                    <div className="ssb-hero-ph" aria-hidden="true">
                        <i className="bi bi-image" />
                    </div>
                )}
            </div>
        );

    const text = (
        <div className="ssb-hero-text">
            {slide.eyebrow && (
                <p key={`e${index}`} {...animationProps(block, visible, 0, 'ssb-eyebrow')}>
                    {slide.eyebrow}
                </p>
            )}

            <h1 key={`t${index}`} {...animationProps(block, visible, 1, 'ssb-hero-title')}>
                {slide.title}
            </h1>

            {slide.subtitle && (
                <p key={`s${index}`} {...animationProps(block, visible, 2, 'ssb-hero-sub')}>
                    {slide.subtitle}
                </p>
            )}

            {(slide.primaryLabel || slide.secondaryLabel) && (
                <div {...animationProps(block, visible, 3, 'ssb-buttons')}>
                    {slide.primaryLabel && (
                        <ActionButton
                            to={slide.primaryTo}
                            label={slide.primaryLabel}
                            variant={buttonStyle}
                            shape={buttonShape}
                            size={buttonSize}
                        />
                    )}
                    {slide.secondaryLabel && (
                        <ActionButton
                            to={slide.secondaryTo}
                            label={slide.secondaryLabel}
                            variant="outline"
                            shape={buttonShape}
                            size={buttonSize}
                        />
                    )}
                </div>
            )}

            {showDots && count > 1 && (
                <div className="ssb-hero-dots" role="tablist" aria-label="Hero slides">
                    {slides.map((s2, dot) => (
                        <button
                            key={dot}
                            type="button"
                            role="tab"
                            aria-selected={index === dot}
                            aria-label={`Slide ${dot + 1}`}
                            className={index === dot ? 'is-on' : ''}
                            onClick={(event) => {
                                event.stopPropagation();
                                setIndex(dot);
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div
            className={`ssb-hero is-media-${mediaSide}`}
            style={{ minHeight: `${minHeight}px` }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            {mediaSide === 'behind' && media && <div className="ssb-hero-behind">{media}</div>}

            <div className="ssb-hero-grid">
                {mediaSide === 'left' && media}
                {text}
                {(mediaSide === 'right' || mediaSide === 'below') && media}
            </div>

            {showArrows && count > 1 && (
                <>
                    <button
                        type="button"
                        className="ssb-hero-arrow is-prev"
                        aria-label="Previous slide"
                        onClick={(event) => {
                            event.stopPropagation();
                            setIndex((i) => (i - 1 + count) % count);
                        }}
                    >
                        <i className="bi bi-chevron-left" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className="ssb-hero-arrow is-next"
                        aria-label="Next slide"
                        onClick={(event) => {
                            event.stopPropagation();
                            setIndex((i) => (i + 1) % count);
                        }}
                    >
                        <i className="bi bi-chevron-right" aria-hidden="true" />
                    </button>
                </>
            )}
        </div>
    );
};

const TextBlock = ({ block, visible }) => {
    const {
        eyebrow, heading, body, size, buttons = [],
        buttonShape = 'pill', buttonSize = 'md',
    } = block.props;

    return (
        <>
            {eyebrow && (
                <p {...animationProps(block, visible, 0, 'ssb-eyebrow')}>
                    {eyebrow}
                </p>
            )}

            {heading && (
                <h2 {...animationProps(block, visible, 1, `ssb-heading is-${size || 'lg'}`)}>
                    {heading}
                </h2>
            )}

            {body && (
                <p {...animationProps(block, visible, 2, 'ssb-body')}>
                    {body}
                </p>
            )}

            {buttons.length > 0 && (
                <div {...animationProps(block, visible, 3, 'ssb-buttons')}>
                    {buttons.map((button, i) => (
                        <ActionButton
                            key={i}
                            to={button.to}
                            label={button.label}
                            variant={button.variant || 'solid'}
                            shape={buttonShape}
                            size={buttonSize}
                            icon={button.icon}
                        />
                    ))}
                </div>
            )}
        </>
    );
};

const CardsBlock = ({ block, visible }) => {
    const {
        heading, columns = 3, cardStyle = 'elevated', cardRadius = 16,
        mediaPosition = 'top', mediaRatio = 'wide', cardAlign = 'inherit',
        hoverLift, items = [],
    } = block.props;

    return (
        <>
            {heading && (
                <h2 {...animationProps(block, visible, 0, 'ssb-heading is-lg')}>
                    {heading}
                </h2>
            )}

            <div
                className="ssb-cards"
                style={{ '--ssb-cols': columns, '--ssb-card-radius': `${cardRadius}px` }}
            >
                {items.map((item, i) => {
                    const inner = (
                        <>
                            {item.image ? (
                                <span className="ssb-card-media">
                                    <StoredImage src={item.image} alt="" loading="lazy" />
                                </span>
                            ) : (
                                item.icon && (
                                    <span className="ssb-card-icon" aria-hidden="true">
                                        <i className={`bi ${item.icon}`} />
                                    </span>
                                )
                            )}

                            <span className="ssb-card-text">
                                {item.title && <strong>{item.title}</strong>}
                                {item.body && <span>{item.body}</span>}
                            </span>
                        </>
                    );

                    const className = [
                        'ssb-card',
                        `is-${cardStyle}`,
                        `media-${mediaPosition}`,
                        `ratio-${mediaRatio}`,
                        cardAlign !== 'inherit' ? `align-${cardAlign}` : '',
                        hoverLift ? 'has-lift' : '',
                    ].filter(Boolean).join(' ');
                    /* animationProps carries its own className; spreading it after
                       the card's own would wipe every layout class, so the two are
                       merged explicitly. */
                    const anim = animationProps(block, visible, i + 1, className);

                    return item.to ? (
                        <Link key={i} to={item.to} {...anim}>
                            {inner}
                        </Link>
                    ) : (
                        <div key={i} {...anim}>
                            {inner}
                        </div>
                    );
                })}
            </div>
        </>
    );
};

const BannerBlock = ({ block, visible }) => {
    const {
        heading, body, buttonLabel, buttonTo,
        buttonStyle = 'solid', buttonShape = 'pill',
    } = block.props;

    return (
        <div className="ssb-banner">
            {heading && (
                <h2 {...animationProps(block, visible, 0, 'ssb-heading is-xl')}>
                    {heading}
                </h2>
            )}
            {body && (
                <p {...animationProps(block, visible, 1, 'ssb-body')}>
                    {body}
                </p>
            )}
            {buttonLabel && (
                <div {...animationProps(block, visible, 2, 'ssb-buttons')}>
                    <ActionButton
                        to={buttonTo || '/products'}
                        label={buttonLabel}
                        variant={buttonStyle}
                        shape={buttonShape}
                        size="lg"
                    />
                </div>
            )}
        </div>
    );
};

const SpacerBlock = ({ block }) => (
    <div className="ssb-spacer" style={{ height: `${block.props.height ?? 48}px` }}>
        {block.props.divider && <span className="ssb-divider" aria-hidden="true" />}
    </div>
);

const MarqueeBlock = ({ block }) => {
    const phrases = String(block.props.text || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

    if (phrases.length === 0) return null;

    /* The strip is duplicated so the loop has no visible seam. */
    const doubled = [...phrases, ...phrases];

    return (
        <div className="ssb-marquee" aria-label={phrases.join(', ')}>
            <div
                className={`ssb-marquee-track is-${block.props.direction || 'left'}`}
                style={{ '--ssb-marquee-speed': `${block.props.speed ?? 25}s` }}
            >
                {doubled.map((phrase, i) => (
                    <span key={i} aria-hidden={i >= phrases.length}>
                        {phrase}
                        <i className="bi bi-dot" aria-hidden="true" />
                    </span>
                ))}
            </div>
        </div>
    );
};

const CountdownBlock = ({ block, visible }) => {
    const target = useMemo(() => new Date(block.props.endsAt).getTime(), [block.props.endsAt]);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const left = Math.max(0, target - now);
    const expired = !Number.isFinite(target) || left <= 0;

    const units = [
        { label: 'Days', value: Math.floor(left / 86400000) },
        { label: 'Hours', value: Math.floor((left / 3600000) % 24) },
        { label: 'Minutes', value: Math.floor((left / 60000) % 60) },
        { label: 'Seconds', value: Math.floor((left / 1000) % 60) },
    ];

    return (
        <>
            {block.props.heading && (
                <h2 {...animationProps(block, visible, 0, 'ssb-heading is-lg')}>
                    {block.props.heading}
                </h2>
            )}

            {expired ? (
                <p {...animationProps(block, visible, 1, 'ssb-body')}>
                    {block.props.expiredText || 'This offer has ended.'}
                </p>
            ) : (
                <div {...animationProps(block, visible, 1, 'ssb-countdown')}>
                    {units.map((unit) => (
                        <span className="ssb-count-unit" key={unit.label}>
                            <strong>{String(unit.value).padStart(2, '0')}</strong>
                            <small>{unit.label}</small>
                        </span>
                    ))}
                </div>
            )}
        </>
    );
};

/* Live products, filtered the way the admin chose. */
const ProductRailBlock = ({ block, visible, products = [], format }) => {
    const {
        heading, source, category, ids, exclude, limit = 8, layout = 'grid',
        speed = 40, columns = 4, showArrows = true,
        minRating = 0, inStockOnly, showPrice = true, showRating,
    } = block.props;

    const trackRef = useRef(null);

    const parseIds = (text) =>
        String(text || '')
            .split(',')
            .map((s2) => s2.trim())
            .filter(Boolean);

    const picked = useMemo(() => {
        const skip = new Set(parseIds(exclude));
        let list = products.filter((p) => !skip.has(String(p.id)));

        if (minRating > 0) list = list.filter((p) => (p.rating || 0) >= minRating);
        if (inStockOnly) list = list.filter((p) => (p.stock ?? 1) > 0);

        switch (source) {
            case 'category':
                list = list.filter((p) => p.category === category);
                break;
            case 'topRated':
                list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
                break;
            case 'discount':
                list = [...list].sort(
                    (a, b) => (b.discountPercentage || 0) - (a.discountPercentage || 0)
                );
                break;
            case 'newest':
                list = [...list].sort((a, b) => (b.id > a.id ? 1 : -1));
                break;
            case 'manual': {
                /* Explicit ids keep the order the admin typed them in. */
                const wanted = parseIds(ids);
                list = wanted.map((id) => list.find((p) => String(p.id) === id)).filter(Boolean);
                break;
            }
            default:
                break;
        }

        return list.slice(0, limit);
    }, [products, source, category, ids, exclude, limit, minRating, inStockOnly]);

    /* Nudge the track by roughly one card. */
    const nudge = (direction) => {
        const node = trackRef.current;
        if (!node) return;
        node.scrollBy({ left: direction * (node.clientWidth * 0.8), behavior: 'smooth' });
    };

    const card = (product, i, ariaHidden = false) => (
        <Link
            to={`/product/${product.id}`}
            className="ssb-product"
            key={ariaHidden ? `dup-${product.id}-${i}` : product.id}
            aria-hidden={ariaHidden || undefined}
            tabIndex={ariaHidden ? -1 : undefined}
            {...(layout === 'marquee' ? {} : animationProps(block, visible, i + 1, 'ssb-product'))}
        >
            <span className="ssb-product-media">
                <StoredImage src={product.thumbnail} alt="" loading="lazy" />
            </span>

            <strong>{product.title}</strong>

            {showRating && product.rating != null && (
                <span className="ssb-product-rating">
                    <i className="bi bi-star-fill" aria-hidden="true" />
                    {Number(product.rating).toFixed(1)}
                </span>
            )}

            {showPrice && (
                <span className="ssb-product-price">
                    {format ? format(product.price) : `$${product.price}`}
                </span>
            )}
        </Link>
    );

    if (picked.length === 0) {
        return (
            <>
                {heading && (
                    <h2 {...animationProps(block, visible, 0, 'ssb-heading is-lg')}>{heading}</h2>
                )}
                <p className="ssb-body ssb-muted">No products match this rule yet.</p>
            </>
        );
    }

    /* The marquee duplicates its contents so the loop has no visible
       seam; the copy is hidden from assistive tech. */
    const marqueeItems =
        layout === 'marquee' ? [...picked, ...picked] : picked;

    return (
        <>
            {heading && (
                <h2 {...animationProps(block, visible, 0, 'ssb-heading is-lg')}>{heading}</h2>
            )}

            <div className={`ssb-rail-wrap is-${layout}`}>
                {layout === 'scroll' && showArrows && (
                    <button
                        type="button"
                        className="ssb-rail-arrow is-prev"
                        onClick={(e) => { e.preventDefault(); nudge(-1); }}
                        aria-label="Scroll left"
                    >
                        <i className="bi bi-chevron-left" aria-hidden="true" />
                    </button>
                )}

                <div
                    ref={trackRef}
                    className={`ssb-rail is-${layout}`}
                    style={{
                        '--ssb-rail-cols': columns,
                        '--ssb-rail-speed': `${speed}s`,
                    }}
                >
                    {marqueeItems.map((product, i) =>
                        card(product, i, layout === 'marquee' && i >= picked.length)
                    )}
                </div>

                {layout === 'scroll' && showArrows && (
                    <button
                        type="button"
                        className="ssb-rail-arrow is-next"
                        onClick={(e) => { e.preventDefault(); nudge(1); }}
                        aria-label="Scroll right"
                    >
                        <i className="bi bi-chevron-right" aria-hidden="true" />
                    </button>
                )}
            </div>
        </>
    );
};

/* ------------------------------------------------------------------
   Canvas preview of a storefront section.

   The old version drew a dashed box with an icon in it, which told the
   admin nothing about what they were arranging — the custom content
   blocks rendered for real, so the storefront blocks felt fake by
   comparison.

   This builds the section out of the same live products the canvas
   already receives, laid out the way the real section lays out. It is
   a preview, not the production component (that one needs the page's
   whole fetch/cart/wishlist pipeline), but it is made of real data so
   what the admin drags around looks like the site.
   ------------------------------------------------------------------ */

/* Each native type gets the shape it actually has on the storefront. */
const NATIVE_SHAPE = {
    featured: { kind: 'cards', count: 4, title: 'Featured Products', sub: 'The latest and greatest.' },
    deals: { kind: 'cards', count: 4, title: 'Deals of the Week', sub: 'Our deepest discounts.', badge: true },
    topRated: { kind: 'cards', count: 4, title: 'Top Rated', sub: 'Loved by shoppers.', rating: true },
    recent: { kind: 'cards', count: 4, title: 'Recently Viewed', sub: 'Pick up where you left off.' },
    categories: { kind: 'tiles', count: 4, title: 'Top Categories', sub: 'Curated gear for every lifestyle.' },
    testimonials: { kind: 'quotes', count: 3, title: 'What shoppers say', sub: 'Real customer reviews.' },
    benefits: { kind: 'perks', count: 4, title: '', sub: '' },
    newsletter: { kind: 'signup', count: 0, title: 'Join the list', sub: 'Offers, straight to your inbox.' },
};

const PERKS = [
    { icon: 'bi-truck', label: 'Free shipping', note: 'On orders over $50' },
    { icon: 'bi-arrow-counterclockwise', label: 'Easy returns', note: '30-day window' },
    { icon: 'bi-shield-check', label: 'Secure checkout', note: 'Encrypted payments' },
    { icon: 'bi-headset', label: '24/7 support', note: 'We reply fast' },
];

const NativePreview = ({ block, def, editing, products = [], format }) => {
    const shape = NATIVE_SHAPE[block.type] || { kind: 'cards', count: 4 };
    /* The slider goes to 24 and the site honours all of it; the canvas
       showed at most 8, so raising the count past 8 appeared to do
       nothing here even though the storefront had changed. */
    const limit = Math.min(Number(block.props.limit) || shape.count, 24);
    const heading = block.props.heading?.trim() || shape.title || def?.label;

    /* Deals sort by discount, top-rated by rating, so the preview shows
       plausible members of each section rather than the same four. */
    /* Mirrors applyBlockPicks on the storefront so the canvas shows the
       same products the site will. If these two ever disagree the preview
       stops being a preview. */
    const picked = useMemo(() => {
        const ids = (text) =>
            String(text || '').split(',').map((x) => x.trim()).filter(Boolean);

        const wanted = ids(block.props.pickIds);
        if (wanted.length) {
            const chosen = wanted
                .map((id) => products.find((p) => String(p.id) === id))
                .filter(Boolean);
            if (chosen.length) return chosen;
        }

        const skip = new Set(ids(block.props.excludeIds));
        let list = skip.size ? products.filter((p) => !skip.has(String(p.id))) : [...products];

        if (Number(block.props.minRating) > 0) {
            list = list.filter((p) => (p.rating || 0) >= Number(block.props.minRating));
        }
        if (block.props.inStockOnly) list = list.filter((p) => (p.stock ?? 1) > 0);

        if (block.type === 'deals') {
            list = [...list].sort((a, b) => (b.discountPercentage || 0) - (a.discountPercentage || 0));
        } else if (block.type === 'topRated') {
            list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
        }

        return list.slice(0, limit || shape.count);
    }, [products, block.type, block.props, limit, shape.count]);

    const money = (n) => (format ? format(n) : `$${Number(n).toFixed(2)}`);

    /* No products loaded yet: keep the old stand-in so the canvas never
       renders an empty band the admin cannot see or click. */
    if (shape.kind !== 'signup' && shape.kind !== 'perks' && picked.length === 0) {
        return (
            <div className={`ssb-native ${editing ? 'is-editing' : ''}`}>
                <span className="ssb-native-icon" aria-hidden="true">
                    <i className={`bi ${def?.icon || 'bi-box'}`} />
                </span>
                <strong>{heading}</strong>
                <small>{def?.desc}</small>
            </div>
        );
    }

    return (
        <div className="ssb-np">
            {heading && (
                <div className="ssb-np-head">
                    <div>
                        <h3>{heading}</h3>
                        {shape.sub && <p>{shape.sub}</p>}
                    </div>
                    {editing && <span className="ssb-np-live">live data</span>}
                </div>
            )}

            {shape.kind === 'cards' && (
                <div className="ssb-np-grid">
                    {picked.map((p) => (
                        <article className="ssb-np-card" key={p.id}>
                            <div className="ssb-np-shot">
                                <img src={p.thumbnail || p.images?.[0]} alt="" loading="lazy" />
                                {shape.badge && p.discountPercentage > 0 && (
                                    <span className="ssb-np-off">-{Math.round(p.discountPercentage)}%</span>
                                )}
                            </div>
                            <span className="ssb-np-cat">{String(p.category || '').replace(/-/g, ' ')}</span>
                            <strong className="ssb-np-title">{p.title}</strong>
                            {shape.rating && (
                                <span className="ssb-np-rating">
                                    <i className="bi bi-star-fill" aria-hidden="true" /> {Number(p.rating).toFixed(1)}
                                </span>
                            )}
                            <span className="ssb-np-price">{money(p.price)}</span>
                        </article>
                    ))}
                </div>
            )}

            {shape.kind === 'tiles' && (
                <div className="ssb-np-tiles">
                    {picked.map((p, i) => (
                        <div className={`ssb-np-tile ${i === 0 ? 'is-wide' : ''}`} key={p.id}>
                            <img src={p.thumbnail || p.images?.[0]} alt="" loading="lazy" />
                            <span>{String(p.category || '').replace(/-/g, ' ')}</span>
                        </div>
                    ))}
                </div>
            )}

            {shape.kind === 'quotes' && (
                <div className="ssb-np-quotes">
                    {picked.map((p) => (
                        <blockquote className="ssb-np-quote" key={p.id}>
                            <span className="ssb-np-stars" aria-hidden="true">★★★★★</span>
                            <p>{p.reviews?.[0]?.comment || 'Exactly what I wanted — arrived quickly.'}</p>
                            <footer>{p.reviews?.[0]?.reviewerName || 'Verified buyer'}</footer>
                        </blockquote>
                    ))}
                </div>
            )}

            {shape.kind === 'perks' && (
                <div className="ssb-np-perks">
                    {PERKS.map((perk) => (
                        <div className="ssb-np-perk" key={perk.label}>
                            <i className={`bi ${perk.icon}`} aria-hidden="true" />
                            <strong>{perk.label}</strong>
                            <small>{perk.note}</small>
                        </div>
                    ))}
                </div>
            )}

            {shape.kind === 'signup' && (
                <div className="ssb-np-signup">
                    <input type="text" readOnly placeholder="you@example.com" tabIndex={-1} />
                    <span className="ssb-np-btn">Join now</span>
                </div>
            )}
        </div>
    );
};

/* ---------------------------- the block ----------------------------- */

const BlockRenderer = ({
    block,
    def,
    editing = false,
    selected = false,
    isDark = false,
    products = [],
    format,
    nativeSlots = {},
    onSelect,
}) => {
    const bgImage = useResolvedImage(block.style?.background?.image);
    const animate = block.animation?.preset !== 'none';
    const [ref, visible] = useReveal(animate, block.animation?.once !== false);

    /* Hidden blocks vanish on the site but stay visible (dimmed) in the
       builder, otherwise the admin loses the ability to bring them back. */
    if (block.hidden && !editing) return null;

    const native = Boolean(def?.native);
    const slot = nativeSlots[block.type];

    const body = (() => {
        if (native) {
            /* On the real site the page hands us the genuine section. */
            if (!editing && slot) return slot;
            return (
                <NativePreview
                    block={block}
                    def={def}
                    editing={editing}
                    products={products}
                    format={format}
                />
            );
        }

        switch (block.type) {
            case 'hero':
                return (
                    <HeroBlock
                        block={block}
                        visible={visible}
                        products={products}
                        format={format}
                        editing={editing}
                    />
                );
            case 'text': return <TextBlock block={block} visible={visible} />;
            case 'cards': return <CardsBlock block={block} visible={visible} />;
            case 'banner': return <BannerBlock block={block} visible={visible} />;
            case 'spacer': return <SpacerBlock block={block} />;
            case 'marquee': return <MarqueeBlock block={block} />;
            case 'countdown': return <CountdownBlock block={block} visible={visible} />;
            case 'productRail':
                return <ProductRailBlock block={block} visible={visible} products={products} format={format} />;
            default:
                return null;
        }
    })();

    /* ----------------------------------------------------------------
       Motion for native sections.
  
       Custom blocks call animationProps() on their own inner elements.
       Native sections render markup this file does not own, so nothing
       ever applied the animation classes to them — Motion was dead for
       every storefront block, in the builder and on the site. Applying
       it to the wrapper animates the whole section as one piece, which
       is the only sensible unit here.
       ---------------------------------------------------------------- */
    const nativeAnim = native ? animationProps(block, visible) : { className: '', style: {} };
    const animClass = nativeAnim.className;
    const animStyle = nativeAnim.style;

    /* Content width for a native section.
  
       Its own Bootstrap .container caps it at 1320px, so a *narrower*
       choice has to be enforced from outside. `full` and `wide` are left
       alone so the stock container keeps behaving normally. */
    /* Width is the section's own business too: it ships with a Bootstrap
       container that already caps it, and a second cap outside that just
       fought it. The control is hidden for native blocks, and any value
       left over from an older saved layout is ignored. */
    const nativeWidth = {};

    /* The banner has its own height field in Content. The generic section
       height in Design wins when it is set, so the two controls do not
       silently fight over the same property. */
    const bannerHeight =
        block.type === 'banner' && !(Number(block.style?.minHeight) > 0)
            ? { minHeight: `${block.props.height ?? 360}px` }
            : {};

    return (
        <section
            ref={ref}
            className={[
                'ssb-section',
                `ssb-type-${block.type}`,
                visibilityClass(block),
                editing ? 'is-editing' : '',
                selected ? 'is-selected' : '',
                block.hidden ? 'is-hidden' : '',
                /* An explicit alignment class. The stylesheet used to sniff the
                   inline style with [style*='center'], which broke the moment
                   anything else in that string contained the word "center" —
                   `justify-content: center` from the section-height control did
                   exactly that, so a left-aligned section still matched the
                   centre rule. A real class cannot be fooled. */
                `is-align-${block.style?.align || 'center'}`,
                /* An explicit Light/Dark choice, exposed as a class so the
                   stylesheet can hand the colour down to the text inside a
                   native section — those elements set their own colour, and a
                   direct rule beats an inherited one. */
                block.style?.textColor === 'light' ? 'is-ink-light' : '',
                block.style?.textColor === 'dark' ? 'is-ink-dark' : '',
                /* A native storefront section carries its own opaque background
                   from HomePage.css. When the admin picks a colour, gradient or
                   image here, that stock background sits on top and hides it —
                   which is why Background looked like it did nothing on the
                   storefront blocks while working fine on content blocks. This
                   flag lets the stylesheet punch the stock background out. */
                native && hasCustomBackground(block) ? 'ssb-bg-override' : '',
            ].filter(Boolean).join(' ')}
            style={{ ...sectionStyle(block, { isDark, imageUrl: bgImage, native }), ...bannerHeight }}
            onClick={editing ? (event) => { event.stopPropagation(); onSelect?.(block.id); } : undefined}
            data-block-id={block.id}
        >
            {/* A native section brings its own Bootstrap container, so it does
          NOT get our .ssb-inner width limit — nesting two would shrink
          it. It still needs a wrapper though: without one the section
          had nowhere to receive the animation classes, and on the live
          site it received nothing at all, which is why Motion and
          Content width did nothing once published. */}
            {native ? (
                <div
                    className={`ssb-native-wrap ${animClass}`.trim()}
                    style={{ ...animStyle, ...nativeWidth }}
                >
                    {body}
                </div>
            ) : (
                <div className="ssb-inner" style={innerStyle(block)}>
                    {body}
                </div>
            )}
        </section>
    );
};

export default BlockRenderer;
