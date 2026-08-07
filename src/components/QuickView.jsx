import React, { useCallback, useEffect, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext.jsx';
import { useWishlist } from '../contexts/WishlistContext.jsx';
import { useCurrency } from '../contexts/CurrencyContext.jsx';
import './QuickView.css';

const Stars = ({ rating }) => (
    <span className="qv-stars" aria-label={`${rating.toFixed(1)} out of 5`}>
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

const QuickView = ({ product, onClose }) => {
    const { addToCart } = useCart();
    const { isWishlisted, toggleWishlist } = useWishlist();
    const { format: money } = useCurrency();

    const dialogRef = useRef(null);
    const closeRef = useRef(null);
    const previousFocusRef = useRef(null);

    const [quantity, setQuantity] = useState(1);
    const [activeImage, setActiveImage] = useState(0);

    const open = Boolean(product);

    /* Reset whenever a different product is opened. */
    useEffect(() => {
        if (!open) return;
        setQuantity(1);
        setActiveImage(0);
    }, [product?.id, open]);

    /* Remember focus, lock the page, restore on close. */
    useEffect(() => {
        if (!open) return undefined;

        previousFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusTimer = setTimeout(() => closeRef.current?.focus(), 40);

        return () => {
            clearTimeout(focusTimer);
            document.body.style.overflow = previousOverflow;
            previousFocusRef.current?.focus?.();
        };
    }, [open]);

    /* Escape closes, Tab stays inside the dialog. */
    const handleKeyDown = useCallback(
        (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
                return;
            }

            if (event.key !== 'Tab') return;

            const focusable = dialogRef.current?.querySelectorAll(
                'button:not([disabled]), a[href], input, select, [tabindex]:not([tabindex="-1"])'
            );

            if (!focusable?.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        },
        [onClose]
    );

    if (!open) return null;

    const images = product.images?.length ? product.images.slice(0, 4) : [product.thumbnail];
    const inStock = product.stock > 0;
    const maxQuantity = Math.max(product.stock || 1, 1);
    const saved = isWishlisted(product.id);

    const wasPrice =
        product.discountPercentage > 0
            ? product.price / (1 - product.discountPercentage / 100)
            : null;

    const handleAdd = () => {
        /* CartContext owns the sign-in guard and the toast. */
        for (let index = 0; index < quantity; index += 1) {
            const added = addToCart(product);
            if (added === false) return;
        }
        onClose();
    };

    return (
        <div
            className="qv-backdrop"
            role="presentation"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            onKeyDown={handleKeyDown}
        >
            <div
                className="qv-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="qv-title"
                ref={dialogRef}
            >
                <button type="button" className="qv-close" onClick={onClose} ref={closeRef} aria-label="Close quick view">
                    <i className="bi bi-x-lg" aria-hidden="true" />
                </button>

                {/* ----------------------- gallery ----------------------- */}
                <div className="qv-gallery">
                    <div className="qv-main-image">
                        <img src={images[activeImage]} alt={product.title} />
                        {!inStock && <span className="qv-sold-out">Sold out</span>}
                    </div>

                    {images.length > 1 && (
                        <div className="qv-thumbs">
                            {images.map((image, index) => (
                                <button
                                    key={image}
                                    type="button"
                                    className={`qv-thumb ${index === activeImage ? 'is-active' : ''}`}
                                    onClick={() => setActiveImage(index)}
                                    aria-label={`View image ${index + 1}`}
                                >
                                    <img src={image} alt="" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ------------------------ body ------------------------- */}
                <div className="qv-body">
                    <span className="qv-category">{product.category?.replace(/-/g, ' ')}</span>
                    <h2 id="qv-title">{product.title}</h2>

                    <div className="qv-meta">
                        <Stars rating={product.rating ?? 0} />
                        <span className="qv-rating-value">{(product.rating ?? 0).toFixed(1)}</span>
                        {product.brand && <span className="qv-brand">by {product.brand}</span>}
                    </div>

                    <div className="qv-price">
                        <strong>{money(product.price)}</strong>
                        {wasPrice && <span className="qv-was">{money(wasPrice)}</span>}
                        {product.discountPercentage > 0 && (
                            <span className="qv-save">Save {Math.round(product.discountPercentage)}%</span>
                        )}
                    </div>

                    <p className="qv-description">{product.description}</p>

                    <ul className="qv-facts">
                        <li>
                            <i className="bi bi-box-seam" aria-hidden="true" />
                            {product.shippingInformation || 'Ships in 3-5 business days'}
                        </li>
                        <li>
                            <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                            {product.returnPolicy || '30 days return policy'}
                        </li>
                        <li>
                            <i className={`bi ${inStock ? 'bi-check-circle' : 'bi-x-circle'}`} aria-hidden="true" />
                            {inStock ? `${product.stock} in stock` : 'Currently unavailable'}
                        </li>
                    </ul>

                    {/* --------------------- actions --------------------- */}
                    <div className="qv-actions">
                        <div className="qv-qty" aria-label="Quantity">
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
                                onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                                disabled={quantity >= maxQuantity}
                                aria-label="Increase quantity"
                            >
                                <i className="bi bi-plus" aria-hidden="true" />
                            </button>
                        </div>

                        <button type="button" className="qv-add" onClick={handleAdd} disabled={!inStock}>
                            <i className="bi bi-cart-plus" aria-hidden="true" />
                            {inStock ? 'Add to Cart' : 'Sold out'}
                        </button>

                        <button
                            type="button"
                            className={`qv-wish ${saved ? 'is-saved' : ''}`}
                            onClick={() => toggleWishlist(product)}
                            aria-pressed={saved}
                            aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
                        >
                            <i className={`bi ${saved ? 'bi-heart-fill' : 'bi-heart'}`} aria-hidden="true" />
                        </button>
                    </div>

                    <Link to={`/product/${product.id}`} className="qv-full-link" onClick={onClose}>
                        View full details
                        <i className="bi bi-arrow-right" aria-hidden="true" />
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default QuickView;
