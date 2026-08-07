import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { useAdmin, cartStatus } from '../../contexts/AdminContext.jsx';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { useNotification } from '../../components/Notification.jsx';
import AdminModal, { ConfirmDialog } from './AdminModal.jsx';
import AdminPager from './AdminPager.jsx';
import ImageDropzone from './ImageDropzone.jsx';
import './AdminInventory.css';

const CATEGORIES = [
    'beauty', 'fragrances', 'furniture', 'groceries', 'home-decoration',
    'kitchen-accessories', 'laptops', 'mens-shirts', 'mens-shoes', 'mens-watches',
    'mobile-accessories', 'motorcycle', 'skin-care', 'smartphones',
    'sports-accessories', 'sunglasses', 'tablets', 'tops', 'vehicle',
    'womens-bags', 'womens-dresses', 'womens-jewellery', 'womens-shoes', 'womens-watches',
];

const SORTS = [
    { id: 'default', label: 'Default order' },
    { id: 'title-asc', label: 'Name A → Z' },
    { id: 'title-desc', label: 'Name Z → A' },
    { id: 'price-desc', label: 'Price high → low' },
    { id: 'price-asc', label: 'Price low → high' },
    { id: 'stock-asc', label: 'Stock low → high' },
    { id: 'stock-desc', label: 'Stock high → low' },
    { id: 'value-desc', label: 'Inventory value' },
];

const STOCK_STATES = [
    { id: 'all', label: 'Any stock' },
    { id: 'in', label: 'In stock' },
    { id: 'low', label: 'Low (1–5)' },
    { id: 'out', label: 'Out of stock' },
];

const VISIBILITY = [
    { id: 'all', label: 'All' },
    { id: 'live', label: 'Live' },
    { id: 'hidden', label: 'Hidden' },
];

/* DummyJSON ships a real sku, but locally created rows need one too. */
const makeSku = (title, id) =>
    `${(title || 'NEW').slice(0, 3).toUpperCase()}-${String(id).slice(-4).toUpperCase()}`;

const pretty = (value) => String(value || '').replace(/-/g, ' ');

/* Quotes and commas in a product title would otherwise break the columns. */
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const API = 'https://dummyjson.com';

const AdminInventory = () => {
    const {
        applyOverrides,
        updateProduct,
        deleteProduct,
        createProduct,
        deleted,
        created,
        restoreProduct,
        purgeProduct,
        setPublished,
    } = useAdmin();
    const { format } = useCurrency();
    const { notify } = useNotification();
    const [searchParams, setSearchParams] = useSearchParams();

    const [raw, setRaw] = useState([]);
    const [carts, setCarts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [editing, setEditing] = useState(null);
    const [creating, setCreating] = useState(false);
    const [confirming, setConfirming] = useState(null);
    const [busy, setBusy] = useState(false);

    /* ------------------------- filter state ------------------------- */
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [cats, setCats] = useState([]);
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const [minRating, setMinRating] = useState(0);
    const [visibility, setVisibility] = useState('all');
    const [sort, setSort] = useState('default');
    const [archiveOpen, setArchiveOpen] = useState(false);
    const filtersRef = useRef(null);

    const emptyDraft = {
        title: '', sku: '', category: 'beauty', price: '', stock: '', description: '', images: [],
    };
    const [draft, setDraft] = useState(emptyDraft);

    /* The stock filter stays in the URL so a dashboard card can deep-link to it. */
    const stockState = searchParams.get('filter') || 'all';

    /* ---------------------------- loading --------------------------- */
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                /* limit=0 returns all 194 products — limit=100 silently hides 48%. */
                const [productRes, cartRes] = await Promise.all([
                    axios.get(`${API}/products`, { params: { limit: 0 }, signal: controller.signal }),
                    axios.get(`${API}/carts`, { params: { limit: 0 }, signal: controller.signal }),
                ]);

                if (cancelled) return;
                setRaw(productRes.data.products || []);
                setCarts(cartRes.data.carts || []);
            } catch (err) {
                const aborted =
                    axios.isCancel(err) || err.code === 'ERR_CANCELED' || err.name === 'CanceledError';
                if (!aborted && !cancelled) {
                    console.error('Inventory load failed:', err);
                    setError('We could not load the catalogue right now.');
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

    /* Close the filter popover on an outside click or Escape. */
    useEffect(() => {
        if (!filtersOpen) return undefined;

        const onPointer = (event) => {
            if (!filtersRef.current?.contains(event.target)) setFiltersOpen(false);
        };
        const onKey = (event) => {
            if (event.key === 'Escape') setFiltersOpen(false);
        };

        document.addEventListener('mousedown', onPointer);
        document.addEventListener('keydown', onKey);

        return () => {
            document.removeEventListener('mousedown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [filtersOpen]);

    const products = useMemo(() => applyOverrides(raw), [raw, applyOverrides]);

    /* Deleted rows are filtered out of `products`, so the archive has to
       rebuild them from the untouched API response plus locally created
       items — otherwise it could only ever show bare ids. */
    const archived = useMemo(() => {
        const pool = [...created, ...raw];

        return deleted
            .map((id) => pool.find((product) => product.id === id))
            .filter(Boolean);
    }, [deleted, created, raw]);

    /* The slider ceiling follows the catalogue instead of a magic number. */
    const priceCeiling = useMemo(
        () => Math.ceil(products.reduce((top, item) => Math.max(top, item.price), 0)),
        [products]
    );

    /* ---------------------------- filtering -------------------------- */
    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        const low = minPrice === '' ? null : Number(minPrice);
        const high = maxPrice === '' ? null : Number(maxPrice);

        const list = products.filter((item) => {
            if (stockState === 'low' && !(item.stock > 0 && item.stock <= 5)) return false;
            if (stockState === 'out' && item.stock !== 0) return false;
            if (stockState === 'in' && item.stock <= 5) return false;

            if (visibility === 'live' && item.published === false) return false;
            if (visibility === 'hidden' && item.published !== false) return false;

            if (cats.length && !cats.includes(item.category)) return false;
            if (low !== null && item.price < low) return false;
            if (high !== null && item.price > high) return false;
            if (minRating && (item.rating || 0) < minRating) return false;

            if (!term) return true;

            return (
                item.title.toLowerCase().includes(term) ||
                (item.brand || '').toLowerCase().includes(term) ||
                (item.sku || '').toLowerCase().includes(term) ||
                item.category.toLowerCase().includes(term)
            );
        });

        const sorters = {
            'title-asc': (a, b) => a.title.localeCompare(b.title),
            'title-desc': (a, b) => b.title.localeCompare(a.title),
            'price-asc': (a, b) => a.price - b.price,
            'price-desc': (a, b) => b.price - a.price,
            'stock-asc': (a, b) => a.stock - b.stock,
            'stock-desc': (a, b) => b.stock - a.stock,
            'value-desc': (a, b) => b.price * b.stock - a.price * a.stock,
        };

        /* Sort a copy — filter() already gave us one, but be explicit. */
        return sorters[sort] ? [...list].sort(sorters[sort]) : list;
    }, [products, query, stockState, cats, minPrice, maxPrice, minRating, visibility, sort]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    useEffect(() => {
        setPage(1);
    }, [query, stockState, cats, minPrice, maxPrice, minRating, visibility, sort, pageSize]);

    const activeFilterCount =
        cats.length +
        (minPrice !== '' ? 1 : 0) +
        (maxPrice !== '' ? 1 : 0) +
        (minRating ? 1 : 0) +
        (visibility !== 'all' ? 1 : 0);

    const setStockState = (value) => {
        const next = new URLSearchParams(searchParams);
        if (value === 'all') next.delete('filter');
        else next.set('filter', value);
        setSearchParams(next, { replace: true });
    };

    const toggleCat = (cat) =>
        setCats((current) =>
            current.includes(cat) ? current.filter((entry) => entry !== cat) : [...current, cat]
        );

    const clearFilters = () => {
        setCats([]);
        setMinPrice('');
        setMaxPrice('');
        setMinRating(0);
        setVisibility('all');
        setSort('default');
        setStockState('all');
    };

    /* ----------------------------- stats ----------------------------- */
    const stats = useMemo(() => {
        const revenue = carts.reduce((sum, cart) => sum + (cart.discountedTotal || 0), 0);
        const gross = carts.reduce((sum, cart) => sum + (cart.total || 0), 0);
        const savedPct = gross ? ((gross - revenue) / gross) * 100 : 0;
        const open = carts.filter((cart) => cartStatus(cart).tone !== 'done').length;

        return {
            revenue,
            savedPct,
            open,
            carts: carts.length,
            lowStock: products.filter((item) => item.stock > 0 && item.stock <= 5).length,
            outStock: products.filter((item) => item.stock === 0).length,
        };
    }, [carts, products]);

    /* ----------------------------- export ---------------------------- */
    const exportCsv = () => {
        if (!filtered.length) {
            notify.warning('Nothing to export', 'No products match the current filters.');
            return;
        }

        const header = ['ID', 'SKU', 'Title', 'Brand', 'Category', 'Price USD', 'Stock', 'Stock Value USD', 'Rating'];

        const body = filtered.map((item) => [
            item.id,
            item.sku || makeSku(item.title, item.id),
            item.title,
            item.brand || '—',
            item.category,
            item.price.toFixed(2),
            item.stock,
            (item.price * item.stock).toFixed(2),
            item.rating ?? '—',
        ]);

        /* The BOM makes Excel read UTF-8 instead of mangling accented names. */
        const csv = `\uFEFF${[header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;

        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        notify.success('Export ready', `${filtered.length} products written to CSV.`);
    };

    /* ----------------------------- writes ---------------------------- */
    const startEdit = (product) => {
        setEditing({
            id: product.id,
            title: product.title,
            sku: product.sku || makeSku(product.title, product.id),
            category: product.category,
            price: product.price,
            stock: product.stock,
            description: product.description || '',
            images: product.images?.length ? product.images : [product.thumbnail].filter(Boolean),
            /* Read the stored flag. Only an explicit false means hidden — a
               product nobody has touched is live regardless of its stock. */
            published: product.published !== false,
        });
    };

    const saveEdit = async () => {
        if (!editing.title.trim()) {
            notify.error('Title required', 'A product needs a name.');
            return;
        }

        setBusy(true);

        await updateProduct(editing.id, {
            title: editing.title,
            sku: editing.sku,
            category: editing.category,
            description: editing.description,
            price: Number(editing.price) || 0,
            stock: Number(editing.stock) || 0,
            /* The first image is the cover everywhere else in the app. */
            images: editing.images,
            thumbnail: editing.images[0] || '',
            /* Without this the toggle was purely decorative — it reset every
               time the dialog reopened. */
            published: editing.published,
            availabilityStatus: Number(editing.stock) > 0 ? 'In Stock' : 'Out of Stock',
        });

        setBusy(false);
        setEditing(null);
    };

    /* Duplicating pre-fills the create form instead of writing blindly. */
    const duplicateProduct = () => {
        setDraft({
            title: `${editing.title} (copy)`,
            sku: '',
            category: editing.category,
            price: editing.price,
            stock: 0,
            description: editing.description,
            images: editing.images,
        });
        setEditing(null);
        setCreating(true);
    };

    const submitDraft = async (event) => {
        event.preventDefault();

        if (!draft.title.trim() || !draft.price) {
            notify.error('Missing details', 'A title and a price are required.');
            return;
        }

        setBusy(true);
        await createProduct({
            ...draft,
            sku: draft.sku.trim() || makeSku(draft.title, Date.now()),
            thumbnail: draft.images[0] || '',
        });
        setBusy(false);
        setDraft(emptyDraft);
        setCreating(false);
    };

    const confirmDelete = async () => {
        setBusy(true);
        await deleteProduct(confirming.id, confirming.title);
        setBusy(false);
        setConfirming(null);
    };

    const stockTone = (stock) => (stock === 0 ? 'out' : stock <= 5 ? 'low' : 'ok');

    return (
        <div className="iv-page">
            <header className="iv-header">
                <div>
                    <h1>Product Inventory</h1>
                    <p>Manage your catalog, stock levels, and pricing.</p>
                </div>

                <button type="button" className="iv-add" onClick={() => setCreating(true)}>
                    <i className="bi bi-plus-lg" aria-hidden="true" />
                    Add New Product
                </button>
            </header>

            {/* ---------------------------- toolbar --------------------------- */}
            <div className="iv-toolbar">
                <div className="iv-search">
                    <i className="bi bi-search" aria-hidden="true" />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search products by name, SKU, or category..."
                        aria-label="Search products"
                    />
                    {query && (
                        <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                            <i className="bi bi-x-lg" aria-hidden="true" />
                        </button>
                    )}
                </div>

                <div className="iv-toolbar-actions" ref={filtersRef}>
                    <button
                        type="button"
                        className={`iv-tool ${filtersOpen || activeFilterCount ? 'is-active' : ''}`}
                        onClick={() => setFiltersOpen((v) => !v)}
                        aria-expanded={filtersOpen}
                    >
                        <i className="bi bi-funnel" aria-hidden="true" />
                        Filters
                        {activeFilterCount > 0 && <span className="iv-tool-badge">{activeFilterCount}</span>}
                    </button>

                    <button type="button" className="iv-tool" onClick={exportCsv}>
                        <i className="bi bi-download" aria-hidden="true" />
                        Export CSV
                    </button>

                    {filtersOpen && (
                        <div className="iv-filter-pop" role="group" aria-label="Filter products">
                            <div className="iv-filter-head">
                                <strong>Filters</strong>
                                <button type="button" onClick={clearFilters}>
                                    Reset all
                                </button>
                            </div>

                            <div className="iv-filter-block">
                                <span className="iv-filter-label">Stock status</span>
                                <div className="iv-chiprow">
                                    {STOCK_STATES.map((state) => (
                                        <button
                                            key={state.id}
                                            type="button"
                                            className={stockState === state.id ? 'is-on' : ''}
                                            onClick={() => setStockState(state.id)}
                                        >
                                            {state.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="iv-filter-block">
                                <span className="iv-filter-label">Storefront visibility</span>
                                <div className="iv-chiprow">
                                    {VISIBILITY.map((state) => (
                                        <button
                                            key={state.id}
                                            type="button"
                                            className={visibility === state.id ? 'is-on' : ''}
                                            onClick={() => setVisibility(state.id)}
                                        >
                                            {state.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="iv-filter-block">
                                <span className="iv-filter-label">
                                    Price range <small>up to {format(priceCeiling)}</small>
                                </span>
                                <div className="iv-range">
                                    <input
                                        type="number"
                                        min="0"
                                        value={minPrice}
                                        onChange={(event) => setMinPrice(event.target.value)}
                                        placeholder="Min"
                                        aria-label="Minimum price in USD"
                                    />
                                    <span>—</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={maxPrice}
                                        onChange={(event) => setMaxPrice(event.target.value)}
                                        placeholder="Max"
                                        aria-label="Maximum price in USD"
                                    />
                                </div>
                            </div>

                            <div className="iv-filter-block">
                                <span className="iv-filter-label">Minimum rating</span>
                                <div className="iv-chiprow">
                                    {[0, 3, 4, 4.5].map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            className={minRating === value ? 'is-on' : ''}
                                            onClick={() => setMinRating(value)}
                                        >
                                            {value === 0 ? 'Any' : `${value}★ +`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="iv-filter-block">
                                <span className="iv-filter-label">
                                    Categories {cats.length > 0 && <small>{cats.length} selected</small>}
                                </span>
                                <div className="iv-catbox">
                                    {CATEGORIES.map((cat) => (
                                        <label key={cat} className={cats.includes(cat) ? 'is-on' : ''}>
                                            <input
                                                type="checkbox"
                                                checked={cats.includes(cat)}
                                                onChange={() => toggleCat(cat)}
                                            />
                                            {pretty(cat)}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="iv-filter-block">
                                <span className="iv-filter-label">Sort by</span>
                                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                                    {SORTS.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button type="button" className="iv-filter-apply" onClick={() => setFiltersOpen(false)}>
                                Show {filtered.length.toLocaleString()} products
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* -------------------------- active chips ------------------------- */}
            {(activeFilterCount > 0 || stockState !== 'all' || sort !== 'default' || deleted.length > 0) && (
                <div className="iv-active">
                    {stockState !== 'all' && (
                        <button type="button" className="iv-pill" onClick={() => setStockState('all')}>
                            {STOCK_STATES.find((state) => state.id === stockState)?.label}
                            <i className="bi bi-x" aria-hidden="true" />
                        </button>
                    )}

                    {cats.map((cat) => (
                        <button key={cat} type="button" className="iv-pill" onClick={() => toggleCat(cat)}>
                            {pretty(cat)}
                            <i className="bi bi-x" aria-hidden="true" />
                        </button>
                    ))}

                    {minPrice !== '' && (
                        <button type="button" className="iv-pill" onClick={() => setMinPrice('')}>
                            Min {format(Number(minPrice))}
                            <i className="bi bi-x" aria-hidden="true" />
                        </button>
                    )}

                    {maxPrice !== '' && (
                        <button type="button" className="iv-pill" onClick={() => setMaxPrice('')}>
                            Max {format(Number(maxPrice))}
                            <i className="bi bi-x" aria-hidden="true" />
                        </button>
                    )}

                    {minRating > 0 && (
                        <button type="button" className="iv-pill" onClick={() => setMinRating(0)}>
                            {minRating}★ and up
                            <i className="bi bi-x" aria-hidden="true" />
                        </button>
                    )}

                    {visibility !== 'all' && (
                        <button type="button" className="iv-pill" onClick={() => setVisibility('all')}>
                            {VISIBILITY.find((state) => state.id === visibility)?.label} only
                            <i className="bi bi-x" aria-hidden="true" />
                        </button>
                    )}

                    {sort !== 'default' && (
                        <button type="button" className="iv-pill" onClick={() => setSort('default')}>
                            {SORTS.find((option) => option.id === sort)?.label}
                            <i className="bi bi-x" aria-hidden="true" />
                        </button>
                    )}

                    {deleted.length > 0 && (
                        <button type="button" className="iv-archive-btn" onClick={() => setArchiveOpen(true)}>
                            <i className="bi bi-archive" aria-hidden="true" />
                            Archive ({deleted.length})
                        </button>
                    )}
                </div>
            )}

            {/* ----------------------------- table ----------------------------- */}
            <section className="iv-card">
                {error ? (
                    <div className="iv-empty" role="alert">
                        <i className="bi bi-wifi-off" aria-hidden="true" />
                        <p>{error}</p>
                        <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
                            Retry
                        </button>
                    </div>
                ) : loading ? (
                    <div className="iv-skeletons">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <span className="iv-skeleton" key={i} />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="iv-empty">
                        <i className="bi bi-search" aria-hidden="true" />
                        <p>No products match these filters.</p>
                        <button type="button" onClick={clearFilters}>
                            Reset filters
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="iv-table-wrap">
                            <table className="iv-table">
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Category</th>
                                        <th>Price</th>
                                        <th>Stock Status</th>
                                        <th aria-label="Actions" />
                                    </tr>
                                </thead>

                                <tbody>
                                    {rows.map((item) => (
                                        <tr key={item.id} className={item.isLocal ? 'is-local' : ''}>
                                            <td>
                                                <div className="iv-product">
                                                    <span className="iv-thumb">
                                                        <img src={item.thumbnail} alt="" loading="lazy" />
                                                    </span>

                                                    <div>
                                                        <span className="iv-product-title">
                                                            <Link to={`/product/${item.id}`}>{item.title}</Link>
                                                            {item.published === false && (
                                                                <span className="iv-hidden-tag" title="Not visible to shoppers">
                                                                    <i className="bi bi-eye-slash" aria-hidden="true" />
                                                                    Hidden
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span>SKU: {item.sku || makeSku(item.title, item.id)}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            <td>
                                                <span className="iv-cat-pill">{pretty(item.category)}</span>
                                            </td>

                                            <td>
                                                <strong>{format(item.price)}</strong>
                                            </td>

                                            <td>
                                                <span className={`iv-stock is-${stockTone(item.stock)}`}>
                                                    <span className="iv-stock-dot" aria-hidden="true" />
                                                    {item.stock === 0
                                                        ? 'Out of Stock'
                                                        : item.stock <= 5
                                                            ? `Only ${item.stock} Left`
                                                            : `${item.stock} In Stock`}
                                                </span>
                                            </td>

                                            <td className="iv-actions">
                                                <div className="iv-actions-inner">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPublished(item.id, item.published === false)}
                                                        title={
                                                            item.published === false
                                                                ? 'Publish to storefront'
                                                                : 'Hide from storefront'
                                                        }
                                                        aria-label={
                                                            item.published === false ? 'Publish product' : 'Hide product'
                                                        }
                                                    >
                                                        <i
                                                            className={`bi ${item.published === false ? 'bi-eye-slash' : 'bi-eye'}`}
                                                            aria-hidden="true"
                                                        />
                                                    </button>

                                                    <button type="button" onClick={() => startEdit(item)} title="Edit product">
                                                        <i className="bi bi-pencil" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="is-danger"
                                                        onClick={() => setConfirming(item)}
                                                        title="Delete product"
                                                    >
                                                        <i className="bi bi-trash3" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
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
                            label="products"
                        />
                    </>
                )}
            </section>

            {/* --------------------------- summary cards ------------------------ */}
            <div className="iv-summary">
                <article className="iv-scard">
                    <header>
                        <span className="iv-scard-icon is-violet" aria-hidden="true">
                            <i className="bi bi-graph-up-arrow" />
                        </span>
                        <span className="iv-scard-delta is-up">
                            −{stats.savedPct.toFixed(1)}% in discounts
                        </span>
                    </header>
                    <span className="iv-scard-label">Total sales</span>
                    <strong>{loading ? '—' : format(stats.revenue)}</strong>
                    <small>Across {stats.carts.toLocaleString()} recorded carts</small>
                </article>

                <Link to="/admin/orders" className="iv-scard is-link">
                    <header>
                        <span className="iv-scard-icon is-blue" aria-hidden="true">
                            <i className="bi bi-cart3" />
                        </span>
                        <span className="iv-scard-delta is-flat">Current period</span>
                    </header>
                    <span className="iv-scard-label">Active carts</span>
                    <strong>{loading ? '—' : stats.open.toLocaleString()}</strong>
                    <small>Pending or abandoned — open in Orders</small>
                </Link>

                <button type="button" className="iv-scard is-link" onClick={() => setStockState('low')}>
                    <header>
                        <span className="iv-scard-icon is-amber" aria-hidden="true">
                            <i className="bi bi-exclamation-triangle" />
                        </span>
                        <span className="iv-scard-delta is-down">{stats.outStock} out of stock</span>
                    </header>
                    <span className="iv-scard-label">Low stock alerts</span>
                    <strong>{loading ? '—' : stats.lowStock.toLocaleString()}</strong>
                    <small>5 units or fewer — click to filter</small>
                </button>
            </div>

            {/* --------------------------- add product -------------------------- */}
            <AdminModal
                open={creating}
                onClose={() => setCreating(false)}
                title="Add New Product"
                subtitle="Fill in the details below to add a new item to your inventory."
                size="lg"
                footer={
                    <>
                        <button type="button" className="am-btn is-plain" onClick={() => setCreating(false)}>
                            Cancel
                        </button>
                        <button type="submit" form="iv-create-form" className="am-btn" disabled={busy}>
                            {busy ? (
                                <>
                                    <span className="am-spinner" aria-hidden="true" />
                                    Creating…
                                </>
                            ) : (
                                'Create Product'
                            )}
                        </button>
                    </>
                }
            >
                <form id="iv-create-form" onSubmit={submitDraft} noValidate>
                    <div className="iv-edit-grid">
                        <div className="iv-edit-media">
                            <ImageDropzone
                                images={draft.images}
                                onChange={(images) => setDraft({ ...draft, images })}
                                onError={(message) => notify.warning('Image', message)}
                                busy={busy}
                            />
                        </div>

                        <div className="iv-edit-fields">
                            <div className="am-grid">
                                <div className="am-field is-full">
                                    <label htmlFor="np-title">Product Name</label>
                                    <input
                                        id="np-title"
                                        value={draft.title}
                                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                                        placeholder="e.g. SonicWave Pro 2"
                                    />
                                </div>

                                <div className="am-field">
                                    <label htmlFor="np-sku">SKU</label>
                                    <input
                                        id="np-sku"
                                        value={draft.sku}
                                        onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                                        placeholder="SKU-0000-XX"
                                    />
                                    <span className="am-hint">Left blank? We generate one.</span>
                                </div>

                                <div className="am-field">
                                    <label htmlFor="np-cat">Category</label>
                                    <select
                                        id="np-cat"
                                        value={draft.category}
                                        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                                    >
                                        {CATEGORIES.map((cat) => (
                                            <option key={cat} value={cat}>
                                                {pretty(cat)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="am-field">
                                    <label htmlFor="np-price">Price ($)</label>
                                    <div className="am-field-prefix">
                                        <span>$</span>
                                        <input
                                            id="np-price"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={draft.price}
                                            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div className="am-field">
                                    <label htmlFor="np-stock">Stock Quantity</label>
                                    <input
                                        id="np-stock"
                                        type="number"
                                        min="0"
                                        value={draft.stock}
                                        onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                                        placeholder="0"
                                    />
                                </div>

                                <div className="am-field is-full">
                                    <label htmlFor="np-desc">Description</label>
                                    <textarea
                                        id="np-desc"
                                        value={draft.description}
                                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                                        placeholder="Enter product details..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
            </AdminModal>

            {/* --------------------------- edit product ------------------------- */}
            <AdminModal
                open={Boolean(editing)}
                onClose={() => setEditing(null)}
                title="Edit Product"
                subtitle={editing ? `Update details for ${editing.title}` : ''}
                size="lg"
                footer={
                    <>
                        <button type="button" className="am-btn is-plain" onClick={() => setEditing(null)}>
                            Discard
                        </button>
                        <button type="button" className="am-btn is-ghost" onClick={duplicateProduct}>
                            Duplicate
                        </button>
                        <button type="button" className="am-btn" onClick={saveEdit} disabled={busy}>
                            {busy ? (
                                <>
                                    <span className="am-spinner" aria-hidden="true" />
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-save" aria-hidden="true" />
                                    Save Changes
                                </>
                            )}
                        </button>
                    </>
                }
            >
                {editing && (
                    <div className="iv-edit-grid">
                        <div className="iv-edit-media">
                            <ImageDropzone
                                images={editing.images}
                                onChange={(images) => setEditing({ ...editing, images })}
                                onError={(message) => notify.warning('Image', message)}
                                busy={busy}
                            />

                            <div className="am-toggle-row">
                                <div>
                                    <strong>Publish status</strong>
                                    <small>{editing.published ? 'Visible on storefront' : 'Hidden from shoppers'}</small>
                                </div>
                                <button
                                    type="button"
                                    className={`am-switch is-green ${editing.published ? 'is-on' : ''}`}
                                    onClick={() => setEditing({ ...editing, published: !editing.published })}
                                    role="switch"
                                    aria-checked={editing.published}
                                    aria-label="Publish status"
                                >
                                    <span />
                                </button>
                            </div>
                        </div>

                        <div className="iv-edit-fields">
                            <div className="am-field is-full">
                                <label htmlFor="ep-title">Product Name</label>
                                <input
                                    id="ep-title"
                                    value={editing.title}
                                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                                />
                            </div>

                            <div className="am-grid">
                                <div className="am-field">
                                    <label htmlFor="ep-sku">SKU</label>
                                    <input
                                        id="ep-sku"
                                        value={editing.sku}
                                        onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                                    />
                                </div>

                                <div className="am-field">
                                    <label htmlFor="ep-cat">Category</label>
                                    <select
                                        id="ep-cat"
                                        value={editing.category}
                                        onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                                    >
                                        {CATEGORIES.map((cat) => (
                                            <option key={cat} value={cat}>
                                                {pretty(cat)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="am-field">
                                    <label htmlFor="ep-price">Price (USD)</label>
                                    <div className="am-field-prefix">
                                        <span>$</span>
                                        <input
                                            id="ep-price"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={editing.price}
                                            onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="am-field">
                                    <label htmlFor="ep-stock">Current Stock</label>
                                    <input
                                        id="ep-stock"
                                        type="number"
                                        min="0"
                                        value={editing.stock}
                                        onChange={(e) => setEditing({ ...editing, stock: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="am-field is-full">
                                <label htmlFor="ep-desc">Description</label>
                                <textarea
                                    id="ep-desc"
                                    value={editing.description}
                                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                                />
                            </div>

                            <div className="am-notice is-success">
                                <i className="bi bi-info-circle" aria-hidden="true" />
                                Changes appear in the customer-facing store immediately. They are stored on this
                                device because the demo API does not persist writes.
                            </div>
                        </div>
                    </div>
                )}
            </AdminModal>

            {/* ----------------------------- archive ---------------------------- */}
            <AdminModal
                open={archiveOpen}
                onClose={() => setArchiveOpen(false)}
                title="Archive"
                subtitle={`${archived.length} product${archived.length === 1 ? '' : 's'} hidden from the catalogue`}
                icon="bi-archive"
                size="md"
                footer={
                    <>
                        <button type="button" className="am-btn is-plain" onClick={() => setArchiveOpen(false)}>
                            Close
                        </button>
                        {archived.length > 1 && (
                            <button
                                type="button"
                                className="am-btn is-ghost"
                                onClick={() => {
                                    /* Snapshot the ids first — restoreProduct mutates the
                                       array we are iterating over. */
                                    [...deleted].forEach((id) => restoreProduct(id, true));
                                    notify.success(`${archived.length} products restored.`);
                                    setArchiveOpen(false);
                                }}
                            >
                                Restore all
                            </button>
                        )}
                    </>
                }
            >
                {archived.length === 0 ? (
                    <div className="iv-arch-empty">
                        <i className="bi bi-inbox" aria-hidden="true" />
                        <p>Nothing archived. Deleted products land here.</p>
                    </div>
                ) : (
                    <ul className="iv-arch-list">
                        {archived.map((item) => (
                            <li key={item.id}>
                                <span className="iv-arch-thumb">
                                    <img src={item.thumbnail} alt="" loading="lazy" />
                                </span>

                                <div className="iv-arch-info">
                                    <strong>{item.title}</strong>
                                    <span>
                                        {item.sku || makeSku(item.title, item.id)} · {format(item.price)}
                                    </span>
                                </div>

                                <div className="iv-arch-actions">
                                    <button
                                        type="button"
                                        onClick={() => restoreProduct(item.id)}
                                        title="Restore this product"
                                    >
                                        <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                                        Restore
                                    </button>

                                    {/* Only local products can truly be erased — an API
                      product would simply reappear on the next load. */}
                                    {String(item.id).startsWith('local-') && (
                                        <button
                                            type="button"
                                            className="is-danger"
                                            onClick={() => {
                                                purgeProduct(item.id);
                                                notify.info(`${item.title} erased permanently.`);
                                            }}
                                            title="Delete forever"
                                        >
                                            <i className="bi bi-trash3" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </AdminModal>

            {/* -------------------------- delete product ------------------------ */}
            <ConfirmDialog
                open={Boolean(confirming)}
                onClose={() => setConfirming(null)}
                onConfirm={confirmDelete}
                busy={busy}
                title="Delete Product?"
                message="This action is permanent and cannot be undone. All data associated with this product will be removed from the store's inventory."
                footnote="Secure action required"
            >
                {confirming && (
                    <div className="am-preview">
                        <span className="am-preview-thumb">
                            <img src={confirming.thumbnail} alt="" />
                        </span>

                        <span className="am-preview-info">
                            <span className={`am-preview-tag ${confirming.stock === 0 ? 'is-out' : ''}`}>
                                {confirming.stock === 0 ? 'Out of stock' : 'In stock'}
                            </span>
                            <strong>{confirming.title}</strong>
                            <span className="am-preview-meta">
                                ID: {confirming.sku || makeSku(confirming.title, confirming.id)}
                                <strong>{format(confirming.price)}</strong>
                            </span>
                        </span>
                    </div>
                )}
            </ConfirmDialog>
        </div>
    );
};

export default AdminInventory;
