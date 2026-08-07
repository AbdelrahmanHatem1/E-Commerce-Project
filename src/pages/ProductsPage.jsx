import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../contexts/CartContext.jsx';
import { useWishlist } from '../contexts/WishlistContext.jsx';
import { useCurrency } from '../contexts/CurrencyContext.jsx';
import { useAdmin } from '../contexts/AdminContext.jsx';
import { useNotification } from '../components/Notification.jsx';
import QuickView from '../components/QuickView.jsx';
import './ProductsPage.css';
import StoredImage from '../components/StoredImage.jsx';
import { writeText } from '../lib/storage.js';

const API = 'https://dummyjson.com';
const PAGE_SIZE = 12;

/* ----------------------------------------------------------------
   Storefront groups. DummyJSON ships 24 raw slugs which is far too
   many for a sidebar, so they are folded into four shopper-friendly
   buckets that map onto real category slugs.
   ---------------------------------------------------------------- */
const CATEGORY_GROUPS = [
    {
        id: 'electronics',
        label: 'Electronics',
        slugs: ['laptops', 'smartphones', 'tablets', 'mobile-accessories'],
    },
    {
        id: 'fashion',
        label: 'Fashion',
        slugs: [
            'mens-shirts',
            'mens-shoes',
            'mens-watches',
            'womens-dresses',
            'womens-shoes',
            'womens-watches',
            'womens-bags',
            'womens-jewellery',
            'sunglasses',
            'tops',
        ],
    },
    {
        id: 'home',
        label: 'Home & Living',
        slugs: ['furniture', 'home-decoration', 'kitchen-accessories', 'groceries'],
    },
    {
        id: 'beauty',
        label: 'Beauty',
        slugs: ['beauty', 'fragrances', 'skin-care'],
    },
    {
        id: 'sports',
        label: 'Sports & Auto',
        slugs: ['sports-accessories', 'motorcycle', 'vehicle'],
    },
];

const SORT_OPTIONS = [
    { id: 'newest', label: 'Newest Arrivals' },
    { id: 'price-asc', label: 'Price: Low to High' },
    { id: 'price-desc', label: 'Price: High to Low' },
    { id: 'rating', label: 'Highest Rated' },
    { id: 'discount', label: 'Biggest Discount' },
    { id: 'name', label: 'Name: A to Z' },
];

const PRICE_FALLBACK_MAX = 2000;

const originalPrice = (product) =>
    product.discountPercentage > 0
        ? product.price / (1 - product.discountPercentage / 100)
        : null;

const getBadge = (product) => {
    if (product.stock === 0) return { label: 'SOLD OUT', tone: 'out' };
    if (product.stock <= 5) return { label: `ONLY ${product.stock}`, tone: 'low' };
    if (product.discountPercentage >= 15)
        return { label: `-${Math.round(product.discountPercentage)}%`, tone: 'deal' };
    if (product.rating >= 4.7) return { label: 'NEW', tone: 'new' };
    return null;
};

/* ----------------------------------------------------------------
   Product tile
   ---------------------------------------------------------------- */
const ProductTile = ({ product, onAdd, onQuickView, isSaved, onToggleSave, onOpen, money, view }) => {
    const badge = getBadge(product);
    const was = originalPrice(product);
    const soldOut = product.stock === 0;

    return (
        <article className={`pp-card ${view === "list" ? "is-list" : ""}`}>
            <Link to={`/product/${product.id}`} className="pp-card-media" onClick={() => onOpen(product)}>
                <StoredImage src={product.thumbnail} alt={product.title} loading="lazy" />
                {badge && <span className={`pp-flag is-${badge.tone}`}>{badge.label}</span>}

                <div className="pp-card-tools">
                    <button
                        type="button"
                        className={`pp-tool ${isSaved ? 'is-saved' : ''}`}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onToggleSave(product);
                        }}
                        aria-pressed={isSaved}
                        aria-label={isSaved ? `Remove ${product.title} from wishlist` : `Save ${product.title}`}
                    >
                        <i className={`bi ${isSaved ? 'bi-heart-fill' : 'bi-heart'}`} aria-hidden="true" />
                    </button>

                    <button
                        type="button"
                        className="pp-tool"
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onQuickView(product);
                        }}
                        aria-label={`Quick view ${product.title}`}
                    >
                        <i className="bi bi-eye" aria-hidden="true" />
                    </button>
                </div>
            </Link>

            <div className="pp-card-body">
                <div className="pp-card-head">
                    <Link to={`/product/${product.id}`} className="pp-card-title" onClick={() => onOpen(product)}>
                        {product.title}
                    </Link>
                    <span className="pp-card-rating">
                        <i className="bi bi-star-fill" aria-hidden="true" />
                        {product.rating?.toFixed(1)}
                    </span>
                </div>

                <p className="pp-card-desc">{product.description}</p>

                <div className="pp-card-foot">
                    <div className="pp-card-price">
                        <strong>{money(product.price)}</strong>
                        {was && <span>{money(was)}</span>}
                    </div>

                    <button
                        type="button"
                        className="pp-add"
                        onClick={() => onAdd(product)}
                        disabled={soldOut}
                        aria-label={soldOut ? `${product.title} sold out` : `Add ${product.title} to cart`}
                    >
                        <i className={`bi ${soldOut ? 'bi-slash-circle' : 'bi-cart-plus'}`} aria-hidden="true" />
                        <span>{soldOut ? 'Sold' : 'Add'}</span>
                    </button>
                </div>
            </div>
        </article>
    );
};

/* ----------------------------------------------------------------
   Products page
   ---------------------------------------------------------------- */
const ProductsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { addToCart } = useCart();
    const { isWishlisted, toggleWishlist, trackView } = useWishlist();
    const { format: money, currency, setCurrency, currencies, convert } = useCurrency();
    const { notify } = useNotification();

    const { applyOverrides } = useAdmin();
    const [apiProducts, setApiProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [quickViewProduct, setQuickViewProduct] = useState(null);
    const [filtersOpen, setFiltersOpen] = useState(false);

    /* Preferences that belong to the shopper, not to the URL. */
    const [view, setView] = useState(() => localStorage.getItem('shopstream_view') || 'grid');

    /* Phones swap page numbers for a growing list. Tracked in state so a
       rotate or resize switches modes instead of staying stale. */
    const [isCompact, setIsCompact] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(max-width: 620px)').matches
    );
    const [searchDraft, setSearchDraft] = useState('');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const gridTopRef = useRef(null);
    const isFirstRender = useRef(true);

    /* ---------------- URL is the single source of truth ---------------- */
    const query = (searchParams.get('q') || '').trim();
    const activeGroups = (searchParams.get('cat') || '').split(',').filter(Boolean);
    const minPrice = Number(searchParams.get('min') || 0);
    const rawMax = searchParams.get('max');

    const minRating = Number(searchParams.get('rating') || 0);
    const brand = searchParams.get('brand') || '';
    const sort = searchParams.get('sort') || 'newest';
    const page = Math.max(1, Number(searchParams.get('page') || 1));

    const patchParams = useCallback(
        (updates, { resetPage = true } = {}) => {
            const next = new URLSearchParams(searchParams);

            Object.entries(updates).forEach(([key, value]) => {
                if (value === '' || value === null || value === undefined) next.delete(key);
                else next.set(key, String(value));
            });

            if (resetPage) next.delete('page');
            setSearchParams(next, { replace: true });
        },
        [searchParams, setSearchParams]
    );

    /* -------------------------------------------------------------
       Fetch strategy.
  
       DummyJSON has NO server-side price / brand / rating filters, so
       paginating on the server would produce wrong counts the moment a
       filter is applied. Instead we pull the matching set once (capped
       at 100) and do filtering, sorting and paging on the client. That
       keeps "Showing 1-12 of 84 results" honest.
       ------------------------------------------------------------- */
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                let collected = [];

                if (query) {
                    const { data } = await axios.get(`${API}/products/search`, {
                        params: { q: query, limit: 0 },
                        signal: controller.signal,
                    });
                    collected = data.products || [];
                } else if (activeGroups.length > 0) {
                    const slugs = CATEGORY_GROUPS.filter((group) => activeGroups.includes(group.id)).flatMap(
                        (group) => group.slugs
                    );

                    const responses = await Promise.allSettled(
                        slugs.map((slug) =>
                            axios.get(`${API}/products/category/${slug}`, {
                                params: { limit: 0 },
                                signal: controller.signal,
                            })
                        )
                    );

                    const seen = new Set();
                    responses.forEach((response) => {
                        if (response.status !== 'fulfilled') return;
                        (response.value.data.products || []).forEach((product) => {
                            if (seen.has(product.id)) return;
                            seen.add(product.id);
                            collected.push(product);
                        });
                    });
                } else {
                    const { data } = await axios.get(`${API}/products`, {
                        params: { limit: 0 },
                        signal: controller.signal,
                    });
                    collected = data.products || [];
                }

                if (!cancelled) setApiProducts(collected);
            } catch (err) {
                if (cancelled || axios.isCancel(err) || err.code === 'ERR_CANCELED') return;
                console.error('Failed to load products:', err);
                setError('We could not load the catalogue right now.');
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
    }, [query, searchParams.get('cat'), reloadKey]);

    /* ----------------------------------------------------------------
       Admin edits are stored locally because the demo API never persists
       a write. Without this the storefront kept serving the original API
       rows: a deleted product stayed on sale and a price change never
       reached a shopper.
  
       Scope 'store' also drops anything the admin unpublished.
       ---------------------------------------------------------------- */
    const rawProducts = useMemo(() => {
        /* When a category filter is on, the API only returned that slice —
           so only inject locally created products from the same slugs.
           A search result set gets no injections at all: we cannot re-run
           the server's relevance matching on the client. */
        const slugs = activeGroups.length
            ? CATEGORY_GROUPS.filter((group) => activeGroups.includes(group.id)).flatMap(
                (group) => group.slugs
            )
            : null;

        return applyOverrides(apiProducts, 'store', {
            categories: slugs,
            includeCreated: !query,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiProducts, applyOverrides, query, searchParams.get('cat')]);

    /* The ceiling comes from the data, so nothing is ever unreachable. */
    const priceCeiling = useMemo(() => {
        if (rawProducts.length === 0) return PRICE_FALLBACK_MAX;
        const highest = Math.max(...rawProducts.map((item) => item.price));
        return Math.ceil(highest / 100) * 100;
    }, [rawProducts]);

    const maxPrice = rawMax === null ? priceCeiling : Number(rawMax);

    /* ---------------------- brands for the dropdown --------------------- */
    const brands = useMemo(() => {
        const set = new Set();
        rawProducts.forEach((product) => {
            if (product.brand) set.add(product.brand);
        });
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [rawProducts]);

    /* Count how many products survive every filter EXCEPT the one being
       counted — that is what makes "Fashion (34)" honest. */
    const countWithout = useCallback(
        (skip) =>
            rawProducts.filter((product) => {
                if (skip !== 'price' && (product.price < minPrice || product.price > maxPrice)) return false;
                if (skip !== 'rating' && minRating > 0 && (product.rating ?? 0) < minRating) return false;
                if (skip !== 'brand' && brand && product.brand !== brand) return false;
                return true;
            }),
        [rawProducts, minPrice, maxPrice, minRating, brand]
    );

    const ratingCounts = useMemo(() => {
        const pool = countWithout('rating');
        return { 4: pool.filter((p) => (p.rating ?? 0) >= 4).length, 3: pool.filter((p) => (p.rating ?? 0) >= 3).length };
    }, [countWithout]);

    const brandCounts = useMemo(() => {
        const pool = countWithout('brand');
        const map = {};
        pool.forEach((product) => {
            if (product.brand) map[product.brand] = (map[product.brand] || 0) + 1;
        });
        return map;
    }, [countWithout]);

    /* --------------------- filter + sort on the client ------------------ */
    const filtered = useMemo(() => {
        let list = rawProducts.filter((product) => {
            if (product.price < minPrice) return false;
            if (product.price > maxPrice) return false;
            if (minRating > 0 && (product.rating ?? 0) < minRating) return false;
            if (brand && product.brand !== brand) return false;
            return true;
        });

        const comparators = {
            'price-asc': (a, b) => a.price - b.price,
            'price-desc': (a, b) => b.price - a.price,
            rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
            discount: (a, b) => (b.discountPercentage ?? 0) - (a.discountPercentage ?? 0),
            name: (a, b) => a.title.localeCompare(b.title),
            newest: (a, b) => b.id - a.id,
        };

        list = [...list].sort(comparators[sort] || comparators.newest);
        return list;
    }, [rawProducts, minPrice, maxPrice, minRating, brand, sort]);

    const totalResults = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageItems = isCompact
        ? filtered.slice(0, visibleCount)
        : filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const rangeStart = totalResults === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(safePage * PAGE_SIZE, totalResults);

    /* A filter change can leave you on a page that no longer exists. */
    useEffect(() => {
        if (page > totalPages) patchParams({ page: null }, { resetPage: false });
    }, [page, totalPages, patchParams]);

    /* Scroll back to the grid on page change, but never on first paint. */
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [safePage]);

    /* Watch the breakpoint rather than reading it once. */
    useEffect(() => {
        const media = window.matchMedia('(max-width: 620px)');
        const sync = (event) => setIsCompact(event.matches);

        media.addEventListener('change', sync);
        return () => media.removeEventListener('change', sync);
    }, []);

    /* Remember the layout choice across visits. */
    useEffect(() => {
        writeText('shopstream_view', view);
    }, [view]);

    /* Keep the in-page search box aligned with the URL. */
    useEffect(() => {
        setSearchDraft(query);
    }, [query]);

    /* Debounce typing so we do not rewrite the URL on every keystroke. */
    useEffect(() => {
        if (searchDraft === query) return undefined;

        const timer = setTimeout(() => {
            patchParams({ q: searchDraft.trim() || null });
        }, 450);

        return () => clearTimeout(timer);
    }, [searchDraft, query, patchParams]);

    /* Any filter change restarts the mobile "load more" stack. */
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [query, minPrice, maxPrice, minRating, brand, sort, searchParams.get('cat')]);

    /* Lock the page behind the mobile filter drawer. */
    useEffect(() => {
        if (!filtersOpen) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, [filtersOpen]);

    /* ----------------------------- actions ----------------------------- */
    const toggleGroup = (groupId) => {
        const next = activeGroups.includes(groupId)
            ? activeGroups.filter((id) => id !== groupId)
            : [...activeGroups, groupId];

        /* Brands differ per category, so a stale brand must be dropped. */
        patchParams({ cat: next.join(','), brand: null });
    };

    const clearFilters = () => {
        const next = new URLSearchParams();
        if (query) next.set('q', query);
        setSearchParams(next, { replace: true });
        notify.info('Filters cleared.');
    };

    const activeFilterCount =
        activeGroups.length +
        (minPrice > 0 ? 1 : 0) +
        (maxPrice < priceCeiling ? 1 : 0) +
        (minRating > 0 ? 1 : 0) +
        (brand ? 1 : 0);

    const goToPage = (target) => {
        if (target < 1 || target > totalPages) return;
        patchParams({ page: target === 1 ? null : target }, { resetPage: false });
    };

    /* Compact pager: 1 … 4 5 6 … 12 */
    const pageNumbers = useMemo(() => {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

        const pages = new Set([1, totalPages, safePage]);
        if (safePage > 1) pages.add(safePage - 1);
        if (safePage < totalPages) pages.add(safePage + 1);

        const sorted = [...pages].sort((a, b) => a - b);
        const output = [];

        sorted.forEach((value, index) => {
            if (index > 0 && value - sorted[index - 1] > 1) output.push('…');
            output.push(value);
        });

        return output;
    }, [safePage, totalPages]);

    /* ------------------------------ filters ---------------------------- */
    const FilterPanel = (
        <>
            <fieldset className="pp-filter-block">
                <legend>Category</legend>
                {CATEGORY_GROUPS.map((group) => (
                    <label className="pp-check" key={group.id}>
                        <input
                            type="checkbox"
                            checked={activeGroups.includes(group.id)}
                            onChange={() => toggleGroup(group.id)}
                        />
                        <span className="pp-checkbox" aria-hidden="true">
                            <i className="bi bi-check2" />
                        </span>
                        <span>{group.label}</span>
                        <span className="pp-count-pill">
                            {rawProducts.filter((product) => group.slugs.includes(product.category)).length ||
                                ''}
                        </span>
                    </label>
                ))}
            </fieldset>

            <fieldset className="pp-filter-block">
                <legend>Price Range</legend>

                <div className="pp-dual-range">
                    <span className="pp-range-track" aria-hidden="true">
                        <span
                            className="pp-range-fill"
                            style={{
                                left: `${(minPrice / priceCeiling) * 100}%`,
                                right: `${100 - (maxPrice / priceCeiling) * 100}%`,
                            }}
                        />
                    </span>

                    <input
                        type="range"
                        min="0"
                        max={priceCeiling}
                        step={Math.max(1, Math.round(priceCeiling / 200))}
                        value={minPrice}
                        onChange={(event) => {
                            const value = Math.min(Number(event.target.value), maxPrice - 1);
                            patchParams({ min: value > 0 ? value : null });
                        }}
                        className="pp-range pp-range--min"
                        aria-label="Minimum price"
                    />

                    <input
                        type="range"
                        min="0"
                        max={priceCeiling}
                        step={Math.max(1, Math.round(priceCeiling / 200))}
                        value={maxPrice}
                        onChange={(event) => {
                            const value = Math.max(Number(event.target.value), minPrice + 1);
                            patchParams({ max: value < priceCeiling ? value : null });
                        }}
                        className="pp-range pp-range--max"
                        aria-label="Maximum price"
                    />
                </div>

                <div className="pp-range-labels">
                    <span>{money(minPrice)}</span>
                    <span>{maxPrice >= priceCeiling ? `${money(priceCeiling)}+` : money(maxPrice)}</span>
                </div>
            </fieldset>

            <fieldset className="pp-filter-block">
                <legend>Rating</legend>
                {[4, 3].map((value) => (
                    <label className="pp-check pp-check--radio" key={value}>
                        <input
                            type="radio"
                            name="rating"
                            checked={minRating === value}
                            onChange={() => patchParams({ rating: value })}
                        />
                        <span className="pp-stars" aria-hidden="true">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <i key={star} className={`bi ${star <= value ? 'bi-star-fill' : 'bi-star'}`} />
                            ))}
                        </span>
                        <span>&amp; Up</span>
                        <span className="pp-count-pill">{ratingCounts[value] || ''}</span>
                    </label>
                ))}
                {minRating > 0 && (
                    <button type="button" className="pp-mini-clear" onClick={() => patchParams({ rating: null })}>
                        Any rating
                    </button>
                )}
            </fieldset>

            <fieldset className="pp-filter-block">
                <legend>Brand</legend>
                <div className="pp-select-wrap">
                    <select
                        value={brand}
                        onChange={(event) => patchParams({ brand: event.target.value })}
                        aria-label="Filter by brand"
                    >
                        <option value="">All Brands</option>
                        {brands.map((name) => (
                            <option key={name} value={name}>
                                {name} ({brandCounts[name] ?? 0})
                            </option>
                        ))}
                    </select>
                    <i className="bi bi-chevron-down" aria-hidden="true" />
                </div>
                {brands.length === 0 && !loading && <p className="pp-hint">No brands in this selection.</p>}
            </fieldset>

            <button
                type="button"
                className="pp-clear"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
            >
                Clear Filters
            </button>
        </>
    );

    return (
        <main className="pp-page">
            <div className="pp-shell">
                {/* --------------------------- header --------------------------- */}
                <header className="pp-header">
                    <div>
                        <h1>{query ? `Results for “${query}”` : 'All Products'}</h1>
                        <nav className="pp-breadcrumb" aria-label="Breadcrumb">
                            <Link to="/">Home</Link>
                            <i className="bi bi-chevron-right" aria-hidden="true" />
                            <span>Products</span>
                        </nav>
                    </div>

                    <button
                        type="button"
                        className="pp-filter-toggle"
                        onClick={() => setFiltersOpen(true)}
                        aria-expanded={filtersOpen}
                    >
                        <i className="bi bi-sliders" aria-hidden="true" />
                        Filters
                        {activeFilterCount > 0 && <span className="pp-filter-count">{activeFilterCount}</span>}
                    </button>
                </header>

                <div className="pp-layout">
                    {/* -------------------------- sidebar ------------------------- */}
                    <aside className="pp-sidebar" aria-label="Product filters">
                        {FilterPanel}
                    </aside>

                    {/* -------------------------- results ------------------------- */}
                    <section className="pp-results">
                        <div className="pp-toolbar" ref={gridTopRef}>
                            <div className="pp-count">
                                <strong>{query ? 'Search results' : 'All Products'}</strong>
                                <span>
                                    {loading
                                        ? 'Loading…'
                                        : totalResults === 0
                                            ? 'No results'
                                            : `Showing ${rangeStart}-${rangeEnd} of ${totalResults} results`}
                                </span>
                            </div>

                            <div className="pp-toolbar-right">
                                <div className="pp-inline-search">
                                    <i className="bi bi-search" aria-hidden="true" />
                                    <input
                                        type="search"
                                        value={searchDraft}
                                        onChange={(event) => setSearchDraft(event.target.value)}
                                        placeholder="Search in results…"
                                        aria-label="Search products"
                                    />
                                    {searchDraft && (
                                        <button type="button" onClick={() => setSearchDraft('')} aria-label="Clear search">
                                            <i className="bi bi-x-lg" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>

                                <div className="pp-select-wrap pp-currency">
                                    <select
                                        value={currency}
                                        onChange={(event) => setCurrency(event.target.value)}
                                        aria-label="Display currency"
                                    >
                                        {currencies.map((item) => (
                                            <option key={item.code} value={item.code}>
                                                {item.code}
                                            </option>
                                        ))}
                                    </select>
                                    <i className="bi bi-chevron-down" aria-hidden="true" />
                                </div>

                                <div className="pp-view-toggle" role="group" aria-label="Layout">
                                    <button
                                        type="button"
                                        className={view === 'grid' ? 'is-active' : ''}
                                        onClick={() => setView('grid')}
                                        aria-pressed={view === 'grid'}
                                        aria-label="Grid view"
                                    >
                                        <i className="bi bi-grid-3x3-gap-fill" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className={view === 'list' ? 'is-active' : ''}
                                        onClick={() => setView('list')}
                                        aria-pressed={view === 'list'}
                                        aria-label="List view"
                                    >
                                        <i className="bi bi-list-ul" aria-hidden="true" />
                                    </button>
                                </div>

                                <label className="pp-sort">
                                    <span>Sort by:</span>
                                    <div className="pp-select-wrap">
                                        <select value={sort} onChange={(event) => patchParams({ sort: event.target.value })}>
                                            {SORT_OPTIONS.map((option) => (
                                                <option key={option.id} value={option.id}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                        <i className="bi bi-chevron-down" aria-hidden="true" />
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* active filter chips */}
                        {activeFilterCount > 0 && (
                            <div className="pp-chips">
                                {activeGroups.map((id) => {
                                    const group = CATEGORY_GROUPS.find((item) => item.id === id);
                                    return (
                                        <button type="button" key={id} onClick={() => toggleGroup(id)}>
                                            {group?.label}
                                            <i className="bi bi-x" aria-hidden="true" />
                                        </button>
                                    );
                                })}

                                {maxPrice < priceCeiling && (
                                    <button type="button" onClick={() => patchParams({ max: null })}>
                                        Under {money(maxPrice)}
                                        <i className="bi bi-x" aria-hidden="true" />
                                    </button>
                                )}

                                {minRating > 0 && (
                                    <button type="button" onClick={() => patchParams({ rating: null })}>
                                        {minRating}★ &amp; up
                                        <i className="bi bi-x" aria-hidden="true" />
                                    </button>
                                )}

                                {brand && (
                                    <button type="button" onClick={() => patchParams({ brand: null })}>
                                        {brand}
                                        <i className="bi bi-x" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* states */}
                        {loading && (
                            <div className="pp-grid">
                                {Array.from({ length: 6 }).map((_, index) => (
                                    <span className="pp-skeleton" key={index} />
                                ))}
                            </div>
                        )}

                        {!loading && error && (
                            <div className="pp-empty" role="alert">
                                <i className="bi bi-wifi-off" aria-hidden="true" />
                                <h2>{error}</h2>
                                <p>Check your connection and try again.</p>
                                <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
                                    <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                                    Retry
                                </button>
                            </div>
                        )}

                        {!loading && !error && totalResults === 0 && (
                            <div className="pp-empty">
                                <i className="bi bi-search" aria-hidden="true" />
                                <h2>No products match your filters</h2>
                                <p>
                                    {query
                                        ? `We couldn't find anything for “${query}”. Try a broader search.`
                                        : 'Try widening your price range or clearing a filter.'}
                                </p>
                                <button type="button" onClick={clearFilters}>
                                    <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                                    Clear all filters
                                </button>
                            </div>
                        )}

                        {!loading && !error && totalResults > 0 && (
                            <>
                                <div className={`pp-grid is-${view}`}>
                                    {pageItems.map((product) => (
                                        <ProductTile
                                            key={product.id}
                                            product={product}
                                            onAdd={addToCart}
                                            onQuickView={setQuickViewProduct}
                                            onOpen={trackView}
                                            isSaved={isWishlisted(product.id)}
                                            onToggleSave={toggleWishlist}
                                            money={money}
                                            view={view}
                                        />
                                    ))}
                                </div>

                                {/* Phones prefer a growing list over page numbers. */}
                                {isCompact && visibleCount < totalResults && (
                                    <button
                                        type="button"
                                        className="pp-load-more"
                                        onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                                    >
                                        Load {Math.min(PAGE_SIZE, totalResults - visibleCount)} more
                                        <span>({totalResults - visibleCount} remaining)</span>
                                    </button>
                                )}
                            </>
                        )}

                        {/* -------------------------- pager ------------------------- */}
                        {!loading && !isCompact && totalPages > 1 && (
                            <nav className="pp-pager" aria-label="Pagination">
                                <button
                                    type="button"
                                    onClick={() => goToPage(safePage - 1)}
                                    disabled={safePage === 1}
                                    aria-label="Previous page"
                                >
                                    <i className="bi bi-chevron-left" aria-hidden="true" />
                                </button>

                                {pageNumbers.map((value, index) =>
                                    value === '…' ? (
                                        <span className="pp-gap" key={`gap-${index}`}>
                                            …
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            key={value}
                                            className={value === safePage ? 'is-active' : ''}
                                            onClick={() => goToPage(value)}
                                            aria-current={value === safePage ? 'page' : undefined}
                                        >
                                            {value}
                                        </button>
                                    )
                                )}

                                <button
                                    type="button"
                                    onClick={() => goToPage(safePage + 1)}
                                    disabled={safePage === totalPages}
                                    aria-label="Next page"
                                >
                                    <i className="bi bi-chevron-right" aria-hidden="true" />
                                </button>
                            </nav>
                        )}
                    </section>
                </div>
            </div>

            {/* ---------------------- mobile filter drawer ---------------------- */}
            {filtersOpen && (
                <div
                    className="pp-drawer-backdrop"
                    role="presentation"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) setFiltersOpen(false);
                    }}
                >
                    <div className="pp-drawer" role="dialog" aria-modal="true" aria-label="Filters">
                        <div className="pp-drawer-head">
                            <h2>Filters</h2>
                            <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                                <i className="bi bi-x-lg" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="pp-drawer-body">{FilterPanel}</div>

                        <button type="button" className="pp-drawer-apply" onClick={() => setFiltersOpen(false)}>
                            Show {totalResults} result{totalResults === 1 ? '' : 's'}
                        </button>
                    </div>
                </div>
            )}

            <QuickView product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
        </main>
    );
};

export default ProductsPage;
