import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCart } from '../contexts/CartContext.jsx';
import { useWishlist } from '../contexts/WishlistContext.jsx';
import { useCurrency } from '../contexts/CurrencyContext.jsx';
import { useAdmin } from '../contexts/AdminContext.jsx';
import { useNotification } from '../components/Notification.jsx';
import './ProductDetailsPage.css';
import StoredImage from '../components/StoredImage.jsx';

const API = 'https://dummyjson.com';

/* Maps a raw DummyJSON slug back to the storefront group used by
   ProductsPage, so the breadcrumb links to a real filtered view. */
const SLUG_TO_GROUP = {
    laptops: 'electronics',
    smartphones: 'electronics',
    tablets: 'electronics',
    'mobile-accessories': 'electronics',
    'mens-shirts': 'fashion',
    'mens-shoes': 'fashion',
    'mens-watches': 'fashion',
    'womens-dresses': 'fashion',
    'womens-shoes': 'fashion',
    'womens-watches': 'fashion',
    'womens-bags': 'fashion',
    'womens-jewellery': 'fashion',
    sunglasses: 'fashion',
    tops: 'fashion',
    furniture: 'home',
    'home-decoration': 'home',
    'kitchen-accessories': 'home',
    groceries: 'home',
    beauty: 'beauty',
    fragrances: 'beauty',
    'skin-care': 'beauty',
    'sports-accessories': 'sports',
    motorcycle: 'sports',
    vehicle: 'sports',
};

/* DummyJSON has no colour field, so a stable palette is derived from
   the product id. Same product always shows the same options. */
const COLOR_POOL = [
    { name: 'Midnight Indigo', hex: '#3730a3' },
    { name: 'Graphite Black', hex: '#3f3f46' },
    { name: 'Cloud White', hex: '#f4f4f5' },
    { name: 'Forest Green', hex: '#166534' },
    { name: 'Sunset Copper', hex: '#c2410c' },
    { name: 'Ocean Teal', hex: '#0f766e' },
];

/* Locally created products carry a string id like "local-1712…", and
   "local-1712" % 6 is NaN — COLOR_POOL[NaN] is undefined and reading
   .name off it throws during render, blanking the whole page. Hash the
   id to a number so any id shape produces a stable, valid index. */
const idSeed = (id) => {
    if (typeof id === 'number' && Number.isFinite(id)) return Math.abs(id);

    const text = String(id ?? '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) % 100_000;
    }
    return hash;
};

const getColorOptions = (product) => {
    if (!product) return [];

    const start = idSeed(product.id) % COLOR_POOL.length;
    return [0, 1, 2].map((offset) => COLOR_POOL[(start + offset) % COLOR_POOL.length]);
};

/* Same idea for the "In the Box" list — driven by category so it
   always reads as something that ships with this kind of product. */
const BOX_CONTENTS = {
    electronics: ['Hard Case', 'USB-C Cable', 'Quick Start Guide', 'Warranty Card'],
    fashion: ['Dust Bag', 'Care Card', 'Gift Box'],
    home: ['Assembly Kit', 'Care Guide', 'Mounting Hardware'],
    beauty: ['Sample Sachet', 'Usage Leaflet', 'Gift Pouch'],
    sports: ['Carry Strap', 'Cleaning Cloth', 'Manual'],
    default: ['Product Manual', 'Warranty Card'],
};

const Stars = ({ rating, size = 'md' }) => (
    <span className={`pd-stars is-${size}`} aria-label={`${rating.toFixed(1)} out of 5`}>
        {[1, 2, 3, 4, 5].map((star) => (
            <i
                key={star}
                className={`bi ${rating >= star ? 'bi-star-fill' : rating >= star - 0.5 ? 'bi-star-half' : 'bi-star'
                    }`}
                aria-hidden="true"
            />
        ))}
    </span>
);

const formatReviewDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const ProductDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const { addToCart, cartItems } = useCart();
    const { isWishlisted, toggleWishlist, trackView, recentlyViewed } = useWishlist();
    const { format } = useCurrency();
    const { notify } = useNotification();
    const { applyOne, applyOverrides, localProducts } = useAdmin();

    const [product, setProduct] = useState(null);
    const [related, setRelated] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [activeImage, setActiveImage] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [activeTab, setActiveTab] = useState('specs');
    const [zoomed, setZoomed] = useState(false);
    const [activeColor, setActiveColor] = useState(0);
    const [lensPos, setLensPos] = useState(null);
    const [showStickyBar, setShowStickyBar] = useState(false);
    const [notifyEmail, setNotifyEmail] = useState('');
    const [notifySent, setNotifySent] = useState(false);
    const [liveViewers] = useState(() => 6 + Math.floor(Math.random() * 18));

    const trackedRef = useRef(null);
    const buyRowRef = useRef(null);
    const touchStartRef = useRef(null);

    /* ----------------------------- fetch ----------------------------- */
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            setLoading(true);
            setError(null);
            setActiveImage(0);
            setQuantity(1);
            setActiveColor(0);
            setActiveTab('specs');
            window.scrollTo({ top: 0, behavior: 'smooth' });

            try {
                /* A locally created product only exists on this device, so the
                   API would 404 on it — resolve those before making a request. */
                const local = localProducts('store').find((item) => String(item.id) === String(id));

                let data = local;

                if (!data) {
                    const response = await axios.get(`${API}/products/${id}`, {
                        signal: controller.signal,
                    });
                    if (cancelled) return;

                    /* Merge the admin layer. Deleted or unpublished returns null,
                       which has to read as "not found" rather than showing the
                       stale API copy the shopper is no longer allowed to buy. */
                    data = applyOne(response.data, 'store');

                    if (!data) {
                        setError('This product is no longer available.');
                        setLoading(false);
                        return;
                    }
                }

                if (cancelled) return;

                setProduct(data);
                /* Always open at a single unit. DummyJSON's minimumOrderQuantity
                   runs as high as 20 on some products, and seeding the picker
                   with it made every product look like it forced a bulk order.
                   The minimum is still enforced when adding to the cart. */
                setQuantity(1);

                const { data: siblings } = await axios.get(`${API}/products/category/${data.category}`, {
                    params: { limit: 12 },
                    signal: controller.signal,
                });

                if (cancelled) return;

                setRelated(
                    applyOverrides(siblings.products || [], 'store', { includeCreated: false })
                        .filter((item) => item.id !== data.id)
                        .slice(0, 4)
                );
            } catch (err) {
                if (cancelled || axios.isCancel(err) || err.code === 'ERR_CANCELED') return;

                console.error('Failed to load the product:', err);
                setError(
                    err.response?.status === 404
                        ? 'We could not find that product.'
                        : 'We could not load this product right now.'
                );
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, reloadKey]);

    /* Tab title, share preview and rich result data. */
    useEffect(() => {
        if (!product) return undefined;

        const previousTitle = document.title;
        document.title = `${product.title} · ShopStream`;

        const upsertMeta = (attr, key, content) => {
            let tag = document.querySelector(`meta[${attr}="${key}"]`);
            if (!tag) {
                tag = document.createElement('meta');
                tag.setAttribute(attr, key);
                document.head.appendChild(tag);
            }
            tag.setAttribute('content', content);
            return tag;
        };

        const created = [
            upsertMeta('property', 'og:title', product.title),
            upsertMeta('property', 'og:description', product.description.slice(0, 160)),
            upsertMeta('property', 'og:image', product.thumbnail),
            upsertMeta('property', 'og:type', 'product'),
            upsertMeta('name', 'description', product.description.slice(0, 160)),
        ];

        /* JSON-LD so search engines can show price and rating. */
        const jsonLd = document.createElement('script');
        jsonLd.type = 'application/ld+json';
        jsonLd.textContent = JSON.stringify({
            '@context': 'https://schema.org/',
            '@type': 'Product',
            name: product.title,
            image: product.images,
            description: product.description,
            sku: product.sku,
            brand: { '@type': 'Brand', name: product.brand || 'ShopStream' },
            offers: {
                '@type': 'Offer',
                price: product.price,
                priceCurrency: 'USD',
                availability:
                    product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
            aggregateRating: product.rating
                ? {
                    '@type': 'AggregateRating',
                    ratingValue: product.rating,
                    reviewCount: product.reviews?.length || 1,
                }
                : undefined,
        });
        document.head.appendChild(jsonLd);

        return () => {
            document.title = previousTitle;
            jsonLd.remove();
            created.forEach((tag) => tag.remove());
        };
    }, [product]);

    /* Feed Recently Viewed once per product. */
    useEffect(() => {
        if (!product || trackedRef.current === product.id) return;
        trackedRef.current = product.id;
        trackView(product);
    }, [product, trackView]);

    /* Show the sticky purchase bar once the real one scrolls away. */
    useEffect(() => {
        const target = buyRowRef.current;
        if (!target) return undefined;

        /* Older browsers and non-DOM environments lack it; the feature is
           progressive so simply skipping is correct. */
        if (typeof IntersectionObserver === 'undefined') return undefined;

        const observer = new IntersectionObserver(
            ([entry]) => setShowStickyBar(!entry.isIntersecting && entry.boundingClientRect.top < 0),
            { threshold: 0 }
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [product]);

    /* Swipe the gallery on touch devices. */
    const handleTouchStart = (event) => {
        touchStartRef.current = event.touches[0].clientX;
    };

    const handleTouchEnd = (event) => {
        if (touchStartRef.current === null || !product?.images?.length) return;

        const delta = touchStartRef.current - event.changedTouches[0].clientX;
        touchStartRef.current = null;
        if (Math.abs(delta) < 45) return;

        setActiveImage((current) =>
            delta > 0
                ? (current + 1) % product.images.length
                : (current - 1 + product.images.length) % product.images.length
        );
    };

    /* Magnifier follows the pointer instead of zooming from the centre. */
    const handleLensMove = (event) => {
        if (!zoomed) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setLensPos({
            x: ((event.clientX - rect.left) / rect.width) * 100,
            y: ((event.clientY - rect.top) / rect.height) * 100,
        });
    };

    const handleGalleryKeys = useCallback(
        (event) => {
            if (!product?.images?.length) return;

            if (event.key === 'ArrowRight') {
                setActiveImage((current) => (current + 1) % product.images.length);
            }
            if (event.key === 'ArrowLeft') {
                setActiveImage((current) => (current - 1 + product.images.length) % product.images.length);
            }
        },
        [product]
    );

    /* --------------------------- derived ----------------------------- */
    const inCartQty = useMemo(
        () => cartItems.find((item) => item.id === Number(id))?.quantity ?? 0,
        [cartItems, id]
    );

    const reviewSummary = useMemo(() => {
        const reviews = product?.reviews || [];
        if (reviews.length === 0) return null;

        const buckets = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        reviews.forEach((review) => {
            buckets[review.rating] = (buckets[review.rating] || 0) + 1;
        });

        return { total: reviews.length, buckets };
    }, [product]);

    const colors = useMemo(() => getColorOptions(product), [product]);

    if (loading) {
        return (
            <main className="pd-page">
                <div className="pd-shell">
                    <div className="pd-skeleton-layout">
                        <span className="pd-skeleton pd-skeleton-gallery" />
                        <div className="pd-skeleton-info">
                            <span className="pd-skeleton pd-skeleton-line short" />
                            <span className="pd-skeleton pd-skeleton-line title" />
                            <span className="pd-skeleton pd-skeleton-line" />
                            <span className="pd-skeleton pd-skeleton-line" />
                            <span className="pd-skeleton pd-skeleton-button" />
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    if (error || !product) {
        return (
            <main className="pd-page">
                <div className="pd-shell">
                    <div className="pd-error" role="alert">
                        <i className="bi bi-exclamation-octagon" aria-hidden="true" />
                        <h1>{error}</h1>
                        <p>The product may have been removed, or the link is out of date.</p>
                        <div className="pd-error-actions">
                            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
                                <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                                Retry
                            </button>
                            <Link to="/products">Browse all products</Link>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    const images = product.images?.length ? product.images : [product.thumbnail];
    const soldOut = product.stock === 0;
    const lowStock = product.stock > 0 && product.stock <= 5;
    const minOrder = Math.max(1, product.minimumOrderQuantity || 1);
    const saved = isWishlisted(product.id);
    const group = SLUG_TO_GROUP[product.category];
    const boxItems = BOX_CONTENTS[group] || BOX_CONTENTS.default;

    const wasPrice =
        product.discountPercentage > 0 ? product.price / (1 - product.discountPercentage / 100) : null;

    const isNewArrival = product.rating >= 4.5;

    /* The cart keys items by id, so the chosen colour travels with the
       product object and is rendered by CartPage / Checkout. Re-adding
       the same product with a different colour updates the label. */
    const productWithColor = () => ({
        ...product,
        selectedColor: colors[activeColor]?.name || null,
    });

    /* Add exactly what the shopper asked for — nothing more.
  
       An earlier version rounded the order up to the product's
       `minimumOrderQuantity`, which on DummyJSON is as high as 20. The
       picker said 1 and the cart received 20, which is the worst possible
       outcome: the number you confirmed is not the number you bought.
       That field is a quirk of the sample data, not a rule this shop
       enforces, so it no longer touches the quantity at all. */
    const handleAdd = () => {
        for (let index = 0; index < quantity; index += 1) {
            const added = addToCart(productWithColor());
            if (added === false) return;
        }
    };

    const handleBuyNow = () => {
        for (let index = 0; index < quantity; index += 1) {
            const added = addToCart(productWithColor());
            if (added === false) return;
        }
        navigate('/cart');
    };

    const shareProduct = async () => {
        const url = window.location.href;

        if (navigator.share) {
            try {
                await navigator.share({ title: product.title, url });
                return;
            } catch (shareError) {
                if (shareError.name === 'AbortError') return;
            }
        }

        try {
            await navigator.clipboard.writeText(url);
            notify.success('Product link copied to your clipboard.');
        } catch (clipboardError) {
            console.error('Clipboard unavailable:', clipboardError);
            notify.info('Copy the link from your address bar to share this product.');
        }
    };

    return (
        <main className="pd-page">
            <div className="pd-shell">
                {/* -------------------------- breadcrumb -------------------------- */}
                <nav className="pd-breadcrumb" aria-label="Breadcrumb">
                    <Link to="/">Home</Link>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                    <Link to="/products">Products</Link>
                    {group && (
                        <>
                            <i className="bi bi-chevron-right" aria-hidden="true" />
                            <Link to={`/products?cat=${group}`}>{product.category.replace(/-/g, ' ')}</Link>
                        </>
                    )}
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                    <span>{product.title}</span>
                </nav>

                <div className="pd-layout">
                    {/* --------------------------- gallery -------------------------- */}
                    <section
                        className={`pd-gallery ${images.length > 1 ? 'has-thumbs' : ''}`}
                        aria-label="Product images"
                        tabIndex={0}
                        onKeyDown={handleGalleryKeys}
                    >
                        {images.length > 1 && (
                            <div className="pd-thumbs" role="tablist" aria-label="Product image thumbnails">
                                {images.map((image, index) => (
                                    <button
                                        type="button"
                                        key={image}
                                        role="tab"
                                        aria-selected={index === activeImage}
                                        className={`pd-thumb ${index === activeImage ? 'is-active' : ''}`}
                                        onClick={() => setActiveImage(index)}
                                        aria-label={`View image ${index + 1} of ${images.length}`}
                                    >
                                        <StoredImage src={image} alt="" loading="lazy" />
                                    </button>
                                ))}
                            </div>
                        )}

                        <div
                            className={`pd-main-image ${zoomed ? 'is-zoomed' : ''}`}
                            onClick={() => {
                                setZoomed((value) => !value);
                                setLensPos(null);
                            }}
                            onMouseMove={handleLensMove}
                            onMouseLeave={() => setLensPos(null)}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setZoomed((value) => !value);
                                }
                            }}
                            aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
                        >
                            <StoredImage
                                src={images[activeImage]}
                                alt={product.title}
                                style={
                                    zoomed && lensPos
                                        ? { transformOrigin: `${lensPos.x}% ${lensPos.y}%` }
                                        : undefined
                                }
                            />

                            {product.discountPercentage >= 10 && (
                                <span className="pd-flag is-deal">-{Math.round(product.discountPercentage)}%</span>
                            )}
                            {soldOut && <span className="pd-flag is-out">Sold out</span>}

                            <button
                                type="button"
                                className={`pd-gallery-wish ${saved ? 'is-saved' : ''}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    toggleWishlist(product);
                                }}
                                aria-pressed={saved}
                                aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
                            >
                                <i className={`bi ${saved ? 'bi-heart-fill' : 'bi-heart'}`} aria-hidden="true" />
                            </button>

                            <span className="pd-zoom-hint" aria-hidden="true">
                                <i className={`bi ${zoomed ? 'bi-zoom-out' : 'bi-zoom-in'}`} />
                            </span>
                        </div>
                    </section>

                    {/* ----------------------------- info --------------------------- */}
                    <section className="pd-info">
                        <div className="pd-info-head">
                            <div className="pd-badges">
                                {isNewArrival && <span className="pd-pill is-new">New Arrival</span>}
                                {lowStock && <span className="pd-pill is-low">Only {product.stock} left</span>}
                                {product.sku && <span className="pd-sku">SKU: {product.sku}</span>}
                            </div>

                            <button
                                type="button"
                                className="pd-share"
                                onClick={shareProduct}
                                aria-label="Share this product"
                            >
                                <i className="bi bi-share" aria-hidden="true" />
                            </button>
                        </div>

                        <h1>{product.title}</h1>

                        <div className="pd-meta">
                            <Stars rating={product.rating ?? 0} />
                            <span className="pd-rating-value">{(product.rating ?? 0).toFixed(1)}</span>
                            {reviewSummary && (
                                <button
                                    type="button"
                                    className="pd-review-jump"
                                    onClick={() => setActiveTab('reviews')}
                                >
                                    {reviewSummary.total} Review{reviewSummary.total === 1 ? '' : 's'}
                                </button>
                            )}
                            {product.brand && <span className="pd-brand">by {product.brand}</span>}
                        </div>

                        <div className="pd-price">
                            <strong>{format(product.price)}</strong>
                            {wasPrice && <span className="pd-was">{format(wasPrice)}</span>}
                            {product.discountPercentage > 0 && (
                                <span className="pd-save">({Math.round(product.discountPercentage)}% OFF)</span>
                            )}
                        </div>

                        {!soldOut && (
                            <p className="pd-viewers">
                                <span className="pd-viewers-dot" aria-hidden="true" />
                                {liveViewers} people are viewing this right now
                            </p>
                        )}

                        <p className="pd-ship-note">
                            Shipping calculated at checkout. Free shipping on orders over {format(500)}.
                        </p>

                        <p className="pd-summary">{product.description}</p>

                        {/* --------------------- colour picker --------------------- */}
                        {colors.length > 0 && (
                            <div className="pd-option-block">
                                <span className="pd-option-label">
                                    Select Color: <strong>{colors[activeColor].name}</strong>
                                </span>
                                <div className="pd-swatches" role="radiogroup" aria-label="Select colour">
                                    {colors.map((color, index) => (
                                        <button
                                            type="button"
                                            key={color.name}
                                            role="radio"
                                            aria-checked={index === activeColor}
                                            className={`pd-swatch ${index === activeColor ? 'is-active' : ''}`}
                                            style={{ '--swatch': color.hex }}
                                            onClick={() => setActiveColor(index)}
                                            title={color.name}
                                            aria-label={color.name}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* stock + notices */}
                        <p className={`pd-stock ${soldOut ? 'is-out' : lowStock ? 'is-low' : 'is-in'}`}>
                            <i
                                className={`bi ${soldOut
                                        ? 'bi-x-circle-fill'
                                        : lowStock
                                            ? 'bi-exclamation-triangle-fill'
                                            : 'bi-check-circle-fill'
                                    }`}
                                aria-hidden="true"
                            />
                            {soldOut
                                ? 'Currently out of stock'
                                : lowStock
                                    ? `Hurry — only ${product.stock} left in stock`
                                    : `${product.availabilityStatus || 'In Stock'} · ${product.stock} available`}
                        </p>

                        {/* The supplier's own pack size, shown as information only.
                Nothing forces the quantity to it — saying "minimum order"
                while the picker happily sits at 1 was a promise the page
                did not keep. */}
                        {minOrder > 1 && (
                            <p className="pd-min-order">
                                <i className="bi bi-box-seam" aria-hidden="true" />
                                Sold in packs of {minOrder} by the supplier — order any amount here.
                            </p>
                        )}

                        {inCartQty > 0 && (
                            <p className="pd-in-cart">
                                <i className="bi bi-cart-check-fill" aria-hidden="true" />
                                {inCartQty} already in your cart · <Link to="/cart">View cart</Link>
                            </p>
                        )}

                        {/* --------------------- quantity + cart -------------------- */}
                        <div className="pd-buy-row" ref={buyRowRef}>
                            <div className="pd-qty-block">
                                <span className="pd-option-label">Quantity</span>
                                <div className="pd-qty" aria-label="Quantity">
                                    <button
                                        type="button"
                                        onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                                        disabled={quantity <= 1}
                                        aria-label="Decrease quantity"
                                    >
                                        <i className="bi bi-dash" aria-hidden="true" />
                                    </button>
                                    <span>{quantity}</span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setQuantity((value) => Math.min(Math.max(product.stock, 1), value + 1))
                                        }
                                        disabled={quantity >= product.stock}
                                        aria-label="Increase quantity"
                                    >
                                        <i className="bi bi-plus" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            <button type="button" className="pd-add" onClick={handleAdd} disabled={soldOut}>
                                <i className="bi bi-cart-plus" aria-hidden="true" />
                                {soldOut ? 'Sold out' : 'Add to Cart'}
                            </button>
                        </div>

                        {soldOut ? (
                            <div className="pd-notify">
                                {notifySent ? (
                                    <p className="pd-notify-done">
                                        <i className="bi bi-check-circle-fill" aria-hidden="true" />
                                        We will email you the moment it is back.
                                    </p>
                                ) : (
                                    <form
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail.trim())) {
                                                notify.error('Invalid email', 'Enter a valid address so we can reach you.');
                                                return;
                                            }
                                            setNotifySent(true);
                                            notify.success('You are on the restock list for this item.');
                                        }}
                                    >
                                        <label htmlFor="pd-notify-email">
                                            <i className="bi bi-bell" aria-hidden="true" />
                                            Notify me when it is back in stock
                                        </label>
                                        <div className="pd-notify-row">
                                            <input
                                                id="pd-notify-email"
                                                type="email"
                                                value={notifyEmail}
                                                onChange={(event) => setNotifyEmail(event.target.value)}
                                                placeholder="you@example.com"
                                                autoComplete="email"
                                            />
                                            <button type="submit">Notify me</button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        ) : (
                            <button type="button" className="pd-buy" onClick={handleBuyNow}>
                                Buy Now
                            </button>
                        )}

                        {/* ----------------------- trust grid ----------------------- */}
                        <ul className="pd-trust">
                            <li>
                                <i className="bi bi-patch-check" aria-hidden="true" />
                                <span>{product.warrantyInformation || '2 Year Warranty'}</span>
                            </li>
                            <li>
                                <i className="bi bi-truck" aria-hidden="true" />
                                <span>{product.shippingInformation || 'Fast 2-Day Delivery'}</span>
                            </li>
                            <li>
                                <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                                <span>{product.returnPolicy || '30-Day Returns'}</span>
                            </li>
                            <li>
                                <i className="bi bi-headset" aria-hidden="true" />
                                <span>Lifetime Support</span>
                            </li>
                        </ul>

                        {product.tags?.length > 0 && (
                            <div className="pd-tags">
                                {product.tags.map((tag) => (
                                    <Link key={tag} to={`/products?q=${encodeURIComponent(tag)}`}>
                                        #{tag}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* ----------------------------- tabs ----------------------------- */}
                <section className="pd-tabs-section">
                    <div className="pd-tabs" role="tablist" aria-label="Product information">
                        {[
                            { id: 'specs', label: 'Specifications' },
                            { id: 'reviews', label: `User Reviews (${product.reviews?.length ?? 0})` },
                            { id: 'qa', label: 'Q & A' },
                            { id: 'downloads', label: 'Downloads' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === tab.id}
                                className={`pd-tab ${activeTab === tab.id ? 'is-active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="pd-tab-panel" role="tabpanel">
                        {/* ---------------------- specifications ------------------- */}
                        {activeTab === 'specs' && (
                            <div className="pd-spec-grid">
                                <article className="pd-spec-card">
                                    <h3>Product Specs</h3>
                                    <dl>
                                        <div>
                                            <dt>Brand</dt>
                                            <dd>{product.brand || 'Unbranded'}</dd>
                                        </div>
                                        <div>
                                            <dt>Category</dt>
                                            <dd>{product.category.replace(/-/g, ' ')}</dd>
                                        </div>
                                        <div>
                                            <dt>SKU</dt>
                                            <dd>{product.sku || '—'}</dd>
                                        </div>
                                        <div>
                                            <dt>Rating</dt>
                                            <dd>{(product.rating ?? 0).toFixed(1)} / 5</dd>
                                        </div>
                                    </dl>
                                </article>

                                <article className="pd-spec-card">
                                    <h3>Physical</h3>
                                    <dl>
                                        <div>
                                            <dt>Weight</dt>
                                            <dd>{product.weight ? `${product.weight} kg` : '—'}</dd>
                                        </div>
                                        {product.dimensions && (
                                            <>
                                                <div>
                                                    <dt>Width</dt>
                                                    <dd>{product.dimensions.width} cm</dd>
                                                </div>
                                                <div>
                                                    <dt>Height</dt>
                                                    <dd>{product.dimensions.height} cm</dd>
                                                </div>
                                                <div>
                                                    <dt>Depth</dt>
                                                    <dd>{product.dimensions.depth} cm</dd>
                                                </div>
                                            </>
                                        )}
                                    </dl>
                                </article>

                                <article className="pd-spec-card pd-box-card">
                                    <h3>In the Box</h3>
                                    <p>Everything you need to get started right away.</p>

                                    <div className="pd-box-tags">
                                        {boxItems.map((item) => (
                                            <span key={item}>{item}</span>
                                        ))}
                                    </div>

                                    <div className="pd-box-visual" aria-hidden="true">
                                        <StoredImage src={product.thumbnail} alt="" loading="lazy" />
                                    </div>
                                </article>
                            </div>
                        )}

                        {/* -------------------------- reviews ---------------------- */}
                        {activeTab === 'reviews' && (
                            <div className="pd-reviews">
                                {reviewSummary ? (
                                    <>
                                        <div className="pd-review-summary">
                                            <div className="pd-review-score">
                                                <strong>{(product.rating ?? 0).toFixed(1)}</strong>
                                                <Stars rating={product.rating ?? 0} size="lg" />
                                                <span>Based on {reviewSummary.total} reviews</span>
                                            </div>

                                            <div className="pd-review-bars">
                                                {[5, 4, 3, 2, 1].map((star) => {
                                                    const count = reviewSummary.buckets[star] || 0;
                                                    const percent = Math.round((count / reviewSummary.total) * 100);

                                                    return (
                                                        <div className="pd-review-bar" key={star}>
                                                            <span className="pd-bar-label">{star}★</span>
                                                            <span className="pd-bar-track">
                                                                <span className="pd-bar-fill" style={{ width: `${percent}%` }} />
                                                            </span>
                                                            <span className="pd-bar-count">{count}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <ul className="pd-review-list">
                                            {product.reviews.map((review) => (
                                                <li key={`${review.reviewerName}-${review.date}`}>
                                                    <div className="pd-review-head">
                                                        <span className="pd-review-avatar" aria-hidden="true">
                                                            {review.reviewerName.charAt(0)}
                                                        </span>
                                                        <div>
                                                            <strong>{review.reviewerName}</strong>
                                                            <span className="pd-review-date">{formatReviewDate(review.date)}</span>
                                                        </div>
                                                        <Stars rating={review.rating} size="sm" />
                                                    </div>
                                                    <p>{review.comment}</p>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                ) : (
                                    <p className="pd-no-reviews">No reviews yet for this product.</p>
                                )}
                            </div>
                        )}

                        {/* ---------------------------- Q&A ------------------------ */}
                        {activeTab === 'qa' && (
                            <div className="pd-qa">
                                {[
                                    {
                                        q: `How long does delivery take for the ${product.title}?`,
                                        a:
                                            product.shippingInformation ||
                                            'Orders are dispatched within 24 hours and typically arrive in 3-5 business days.',
                                    },
                                    {
                                        q: 'What is the return policy?',
                                        a: `${product.returnPolicy || '30 days return policy'}. Items must be unused and in their original packaging.`,
                                    },
                                    {
                                        q: 'Is a warranty included?',
                                        a: `${product.warrantyInformation || '1 year warranty'} covering manufacturing defects.`,
                                    },
                                    {
                                        q: 'Can I order in bulk?',
                                        a:
                                            minOrder > 1
                                                ? `Yes — this product already ships in packs of ${minOrder}. Contact support for larger volumes.`
                                                : 'Yes. Reach out to our support team for volume pricing on orders above 50 units.',
                                    },
                                ].map((item) => (
                                    <details className="pd-qa-item" key={item.q}>
                                        <summary>
                                            <i className="bi bi-chat-square-quote" aria-hidden="true" />
                                            {item.q}
                                        </summary>
                                        <p>{item.a}</p>
                                    </details>
                                ))}

                                <div className="pd-qa-cta">
                                    <p>Still have a question about this product?</p>
                                    <Link to="/support">Ask our team</Link>
                                </div>
                            </div>
                        )}

                        {/* ------------------------ downloads ---------------------- */}
                        {activeTab === 'downloads' && (
                            <div className="pd-downloads">
                                <a
                                    className="pd-download-card"
                                    href={product.meta?.qrCode}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <i className="bi bi-qr-code" aria-hidden="true" />
                                    <span>
                                        <strong>Product QR Code</strong>
                                        <small>Scan to open this page on your phone</small>
                                    </span>
                                    <i className="bi bi-box-arrow-up-right pd-download-go" aria-hidden="true" />
                                </a>

                                <button
                                    type="button"
                                    className="pd-download-card"
                                    onClick={() => window.print()}
                                >
                                    <i className="bi bi-file-earmark-text" aria-hidden="true" />
                                    <span>
                                        <strong>Spec Sheet</strong>
                                        <small>Print or save this product page as PDF</small>
                                    </span>
                                    <i className="bi bi-printer pd-download-go" aria-hidden="true" />
                                </button>

                                <div className="pd-download-meta">
                                    {product.meta?.barcode && (
                                        <p>
                                            <i className="bi bi-upc-scan" aria-hidden="true" />
                                            Barcode: <strong>{product.meta.barcode}</strong>
                                        </p>
                                    )}
                                    {product.meta?.createdAt && (
                                        <p>
                                            <i className="bi bi-calendar3" aria-hidden="true" />
                                            Listed:{' '}
                                            <strong>
                                                {new Date(product.meta.createdAt).toLocaleDateString('en-US', {
                                                    month: 'long',
                                                    year: 'numeric',
                                                })}
                                            </strong>
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* ----------------------- complete your setup --------------------- */}
                {related.length > 0 && (
                    <section className="pd-related">
                        <div className="pd-related-head">
                            <div>
                                <h2>Complete Your Setup</h2>
                                <p>Recommended products based on your interest.</p>
                            </div>
                            {group && (
                                <Link to={`/products?cat=${group}`}>
                                    View All <i className="bi bi-arrow-right" aria-hidden="true" />
                                </Link>
                            )}
                        </div>

                        <div className="pd-related-grid">
                            {related.map((item, index) => (
                                <article className="pd-related-card" key={item.id}>
                                    <Link to={`/product/${item.id}`} className="pd-related-media">
                                        <StoredImage src={item.thumbnail} alt={item.title} loading="lazy" />
                                        {index === 0 && <span className="pd-related-flag">Pro Choice</span>}
                                    </Link>

                                    <div className="pd-related-body">
                                        <Link to={`/product/${item.id}`} className="pd-related-title">
                                            {item.title}
                                        </Link>

                                        <div className="pd-related-foot">
                                            <strong>{format(item.price)}</strong>

                                            <button
                                                type="button"
                                                className="pd-related-add"
                                                onClick={() => addToCart(item)}
                                                disabled={item.stock === 0}
                                                aria-label={
                                                    item.stock === 0 ? `${item.title} sold out` : `Add ${item.title} to cart`
                                                }
                                            >
                                                <i
                                                    className={`bi ${item.stock === 0 ? 'bi-slash-circle' : 'bi-cart-plus'}`}
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                )}
                {/* ------------------------ recently viewed ---------------------- */}
                {recentlyViewed.filter((item) => item.id !== product.id).length > 0 && (
                    <section className="pd-recent">
                        <div className="pd-recent-head">
                            <h2>Recently Viewed</h2>
                            <Link to="/products">Browse all →</Link>
                        </div>

                        <div className="pd-recent-strip">
                            {recentlyViewed
                                .filter((item) => item.id !== product.id)
                                .map((item) => (
                                    <Link to={`/product/${item.id}`} className="pd-recent-chip" key={item.id}>
                                        <span className="pd-recent-thumb">
                                            {item.thumbnail ? (
                                                <StoredImage src={item.thumbnail} alt="" loading="lazy" />
                                            ) : (
                                                <i className="bi bi-image" aria-hidden="true" />
                                            )}
                                        </span>
                                        <span className="pd-recent-info">
                                            <span className="pd-recent-title">{item.title}</span>
                                            <span className="pd-recent-price">{format(item.price)}</span>
                                        </span>
                                    </Link>
                                ))}
                        </div>
                    </section>
                )}
            </div>

            {/* ----------------------- sticky purchase bar --------------------- */}
            <div className={`pd-sticky ${showStickyBar ? 'is-visible' : ''}`} aria-hidden={!showStickyBar}>
                <div className="pd-sticky-inner">
                    <StoredImage src={product.thumbnail} alt="" className="pd-sticky-thumb" />

                    <div className="pd-sticky-info">
                        <strong>{product.title}</strong>
                        <span>
                            {format(product.price)}
                            {colors[activeColor] && ` · ${colors[activeColor].name}`}
                        </span>
                    </div>

                    <div className="pd-sticky-qty" aria-label="Quantity">
                        <button
                            type="button"
                            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                            disabled={quantity <= 1}
                            aria-label="Decrease quantity"
                            tabIndex={showStickyBar ? 0 : -1}
                        >
                            <i className="bi bi-dash" aria-hidden="true" />
                        </button>
                        <span>{quantity}</span>
                        <button
                            type="button"
                            onClick={() => setQuantity((value) => Math.min(Math.max(product.stock, 1), value + 1))}
                            disabled={quantity >= product.stock}
                            aria-label="Increase quantity"
                            tabIndex={showStickyBar ? 0 : -1}
                        >
                            <i className="bi bi-plus" aria-hidden="true" />
                        </button>
                    </div>

                    <button
                        type="button"
                        className="pd-sticky-add"
                        onClick={handleAdd}
                        disabled={soldOut}
                        tabIndex={showStickyBar ? 0 : -1}
                    >
                        <i className="bi bi-cart-plus" aria-hidden="true" />
                        {soldOut ? 'Sold out' : 'Add to Cart'}
                    </button>
                </div>
            </div>
        </main>
    );
};

export default ProductDetailsPage;
