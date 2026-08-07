import React, { useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext.jsx';
import { useAdmin } from '../contexts/AdminContext.jsx';
import './CategoriesPage.css';

const API = 'https://dummyjson.com';

/* These ids must match CATEGORY_GROUPS in ProductsPage.jsx — the page
   reads them straight from the `cat` search param. */
const GROUPS = [
    {
        id: 'electronics',
        label: 'Electronics',
        icon: 'bi-laptop',
        blurb: 'Laptops, phones, tablets and the accessories that keep them running.',
        slugs: ['laptops', 'smartphones', 'tablets', 'mobile-accessories'],
    },
    {
        id: 'fashion',
        label: 'Fashion',
        icon: 'bi-bag',
        blurb: 'Everyday wear, watches, bags and finishing touches.',
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
        icon: 'bi-house',
        blurb: 'Furniture, decoration and everything for the kitchen.',
        slugs: ['furniture', 'home-decoration', 'kitchen-accessories', 'groceries'],
    },
    {
        id: 'beauty',
        label: 'Beauty',
        icon: 'bi-stars',
        blurb: 'Skincare, fragrance and cosmetics from trusted names.',
        slugs: ['beauty', 'fragrances', 'skin-care'],
    },
    {
        id: 'sports',
        label: 'Sports & Auto',
        icon: 'bi-bicycle',
        blurb: 'Gear for training, riding and the open road.',
        slugs: ['sports-accessories', 'motorcycle', 'vehicle'],
    },
];

const prettySlug = (slug) => slug.replace(/-/g, ' ');

const CategoriesPage = () => {
    const { format } = useCurrency();

    const { applyOverrides } = useAdmin();
    const [apiProducts, setApiProducts] = useState([]);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('default');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        document.title = 'Shop by Category · ShopStream';
        return () => {
            document.title = 'ShopStream';
        };
    }, []);

    /* One request feeds every count, price and cover image on the page. */
    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const { data } = await axios.get(`${API}/products`, {
                    params: { limit: 0, select: 'title,price,category,thumbnail,rating,stock' },
                    signal: controller.signal,
                });

                if (!cancelled) setApiProducts(data.products || []);
            } catch (err) {
                const aborted =
                    axios.isCancel(err) || err.code === 'ERR_CANCELED' || err.name === 'CanceledError';

                if (!aborted && !cancelled) {
                    console.error('Failed to load categories:', err);
                    setError('We could not load the categories right now.');
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

    /* Admin edits are local-only, so merge them before any count, cover
       image or price range is derived from the catalogue. */
    const products = useMemo(
        () => applyOverrides(apiProducts, 'store'),
        [apiProducts, applyOverrides]
    );

    /* Everything on a card is derived — no hard-coded numbers. */
    const groups = useMemo(
        () =>
            GROUPS.map((group) => {
                const items = products.filter((product) => group.slugs.includes(product.category));

                const prices = items.map((item) => item.price);
                const cover =
                    items.slice().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]?.thumbnail || '';

                /* Only slugs that actually returned products become chips. */
                const activeSlugs = group.slugs.filter((slug) =>
                    items.some((item) => item.category === slug)
                );

                return {
                    ...group,
                    count: items.length,
                    from: prices.length ? Math.min(...prices) : 0,
                    cover,
                    activeSlugs,
                    thumbs: items.slice(0, 3).map((item) => item.thumbnail),
                };
            }),
        [products]
    );

    /* Search matches a department name, its blurb or any of its slugs, so
       typing "watch" finds Fashion even though the word is not in the label. */
    const visibleGroups = useMemo(() => {
        const term = query.trim().toLowerCase();

        let list = term
            ? groups.filter(
                (group) =>
                    group.label.toLowerCase().includes(term) ||
                    group.blurb.toLowerCase().includes(term) ||
                    group.slugs.some((slug) => slug.replace(/-/g, ' ').includes(term))
            )
            : groups;

        const comparators = {
            'count-desc': (a, b) => b.count - a.count,
            'price-asc': (a, b) => a.from - b.from,
            name: (a, b) => a.label.localeCompare(b.label),
        };

        if (comparators[sort]) list = [...list].sort(comparators[sort]);
        return list;
    }, [groups, query, sort]);

    const totalProducts = products.length;

    return (
        <main className="cg-page">
            <div className="cg-shell">
                {/* ---------------------------- header --------------------------- */}
                <nav className="cg-breadcrumb" aria-label="Breadcrumb">
                    <Link to="/">Home</Link>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                    <span>Categories</span>
                </nav>

                <header className="cg-header">
                    <div>
                        <h1>Shop by Category</h1>
                        <p>
                            {loading
                                ? 'Loading the catalogue…'
                                : `${totalProducts} products across ${GROUPS.length} departments.`}
                        </p>
                    </div>

                    <Link to="/products" className="cg-all-link">
                        Browse everything
                        <i className="bi bi-arrow-right" aria-hidden="true" />
                    </Link>
                </header>

                {/* ---------------------------- toolbar --------------------------- */}
                {!loading && !error && (
                    <div className="cg-toolbar">
                        <div className="cg-search">
                            <i className="bi bi-search" aria-hidden="true" />
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Find a department…"
                                aria-label="Search departments"
                            />
                            {query && (
                                <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                                    <i className="bi bi-x-lg" aria-hidden="true" />
                                </button>
                            )}
                        </div>

                        <label className="cg-sort">
                            <span>Sort by</span>
                            <div className="cg-select-wrap">
                                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                                    <option value="default">Featured</option>
                                    <option value="count-desc">Most products</option>
                                    <option value="price-asc">Lowest price</option>
                                    <option value="name">Name A-Z</option>
                                </select>
                                <i className="bi bi-chevron-down" aria-hidden="true" />
                            </div>
                        </label>
                    </div>
                )}

                {/* ----------------------------- states -------------------------- */}
                {loading && (
                    <div className="cg-grid">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <span className="cg-skeleton" key={index} />
                        ))}
                    </div>
                )}

                {!loading && error && (
                    <div className="cg-error" role="alert">
                        <i className="bi bi-wifi-off" aria-hidden="true" />
                        <h2>{error}</h2>
                        <p>Check your connection and try again.</p>
                        <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
                            <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                            Retry
                        </button>
                    </div>
                )}

                {/* ----------------------------- cards --------------------------- */}
                {!loading && !error && visibleGroups.length === 0 && (
                    <div className="cg-error">
                        <i className="bi bi-search" aria-hidden="true" />
                        <h2>No department matches &ldquo;{query}&rdquo;</h2>
                        <p>Try a broader word, or search the full catalogue instead.</p>
                        <Link to={`/products?q=${encodeURIComponent(query)}`} className="cg-search-products">
                            Search all products
                        </Link>
                    </div>
                )}

                {!loading && !error && visibleGroups.length > 0 && (
                    <>
                        <div className="cg-grid">
                            {visibleGroups.map((group, index) => (
                                <article
                                    className={`cg-card ${index === 0 ? 'is-feature' : ''}`}
                                    key={group.id}
                                >
                                    <Link to={`/products?cat=${group.id}`} className="cg-card-media">
                                        {group.cover ? (
                                            <img src={group.cover} alt="" loading="lazy" />
                                        ) : (
                                            <i className={`bi ${group.icon}`} aria-hidden="true" />
                                        )}

                                        <span className="cg-card-count">{group.count} items</span>
                                    </Link>

                                    <div className="cg-card-body">
                                        <div className="cg-card-head">
                                            <span className="cg-card-icon" aria-hidden="true">
                                                <i className={`bi ${group.icon}`} />
                                            </span>

                                            <div>
                                                <h2>
                                                    <Link to={`/products?cat=${group.id}`}>{group.label}</Link>
                                                </h2>
                                                <p>{group.blurb}</p>
                                            </div>
                                        </div>

                                        {group.activeSlugs.length > 0 && (
                                            <div className="cg-chips">
                                                {group.activeSlugs.slice(0, index === 0 ? 6 : 4).map((slug) => (
                                                    <Link key={slug} to={`/products?q=${encodeURIComponent(slug)}`}>
                                                        {prettySlug(slug)}
                                                    </Link>
                                                ))}
                                                {group.activeSlugs.length > (index === 0 ? 6 : 4) && (
                                                    <Link to={`/products?cat=${group.id}`} className="cg-chip-more">
                                                        +{group.activeSlugs.length - (index === 0 ? 6 : 4)} more
                                                    </Link>
                                                )}
                                            </div>
                                        )}

                                        <div className="cg-card-foot">
                                            <span className="cg-from">
                                                From <strong>{format(group.from)}</strong>
                                            </span>

                                            <Link to={`/products?cat=${group.id}`} className="cg-shop">
                                                Shop now
                                                <i className="bi bi-arrow-right" aria-hidden="true" />
                                            </Link>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>

                        {/* -------------------------- shortcuts ------------------------ */}
                        <section className="cg-shortcuts">
                            <h2>Quick picks</h2>

                            <div className="cg-shortcut-grid">
                                <Link to="/products?sort=discount" className="cg-shortcut is-deal">
                                    <i className="bi bi-tag-fill" aria-hidden="true" />
                                    <span>
                                        <strong>Best deals</strong>
                                        <small>Biggest discounts right now</small>
                                    </span>
                                </Link>

                                <Link to="/products?rating=4&sort=rating" className="cg-shortcut is-top">
                                    <i className="bi bi-star-fill" aria-hidden="true" />
                                    <span>
                                        <strong>Top rated</strong>
                                        <small>4 stars and above</small>
                                    </span>
                                </Link>

                                <Link to="/products?sort=newest" className="cg-shortcut is-new">
                                    <i className="bi bi-lightning-charge-fill" aria-hidden="true" />
                                    <span>
                                        <strong>New arrivals</strong>
                                        <small>Freshly added to the store</small>
                                    </span>
                                </Link>

                                <Link to="/products?max=50" className="cg-shortcut is-budget">
                                    <i className="bi bi-piggy-bank-fill" aria-hidden="true" />
                                    <span>
                                        <strong>Under {format(50)}</strong>
                                        <small>Great value picks</small>
                                    </span>
                                </Link>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </main>
    );
};

export default CategoriesPage;
