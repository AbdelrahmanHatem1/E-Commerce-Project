import React, { useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { cartStatus } from '../../contexts/AdminContext.jsx';
import { useAdmin } from '../../contexts/AdminContext.jsx';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { useWallet, isReturnOpen } from '../../contexts/WalletContext.jsx';
import { useSupport } from '../../contexts/SupportContext.jsx';
import './AdminDashboard.css';

const API = 'https://dummyjson.com';

const AdminDashboard = () => {
    const { format } = useCurrency();
    const { applyOverrides, pendingChanges } = useAdmin();
    const { returns } = useWallet();
    const { openCount: openTickets, breachedCount } = useSupport();

    const [data, setData] = useState({ carts: [], products: [], users: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const [carts, products, users] = await Promise.all([
                    axios.get(`${API}/carts`, { params: { limit: 0 }, signal: controller.signal }),
                    axios.get(`${API}/products`, {
                        params: { limit: 0, select: 'title,price,stock,category,thumbnail,rating' },
                        signal: controller.signal,
                    }),
                    axios.get(`${API}/users`, { params: { limit: 1 }, signal: controller.signal }),
                ]);

                if (cancelled) return;

                setData({
                    carts: carts.data.carts || [],
                    products: products.data.products || [],
                    users: users.data.total || 0,
                });
            } catch (err) {
                const aborted =
                    axios.isCancel(err) || err.code === 'ERR_CANCELED' || err.name === 'CanceledError';
                if (!aborted && !cancelled) {
                    console.error('Dashboard load failed:', err);
                    setError('We could not load the dashboard right now.');
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

    const products = useMemo(() => applyOverrides(data.products), [data.products, applyOverrides]);

    const metrics = useMemo(() => {
        const revenue = data.carts
            .filter((cart) => cartStatus(cart).tone === 'done')
            .reduce((sum, cart) => sum + (cart.discountedTotal ?? cart.total ?? 0), 0);

        const units = data.carts.reduce((sum, cart) => sum + (cart.totalQuantity ?? 0), 0);
        const lowStock = products.filter((item) => item.stock > 0 && item.stock <= 5);
        const outOfStock = products.filter((item) => item.stock === 0);
        const inventoryValue = products.reduce((sum, item) => sum + item.price * item.stock, 0);

        return {
            revenue,
            units,
            lowStock,
            outOfStock,
            inventoryValue,
            avgOrder: data.carts.length ? revenue / data.carts.length : 0,
        };
    }, [data.carts, products]);

    /* Sales grouped by category, largest first. */
    const byCategory = useMemo(() => {
        const totals = {};

        data.carts.forEach((cart) => {
            (cart.products || []).forEach((line) => {
                const match = products.find((item) => item.id === line.id);
                const key = match?.category || 'other';
                totals[key] = (totals[key] || 0) + (line.total ?? 0);
            });
        });

        const rows = Object.entries(totals)
            .map(([name, value]) => ({ name: name.replace(/-/g, ' '), value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 6);

        const max = Math.max(...rows.map((row) => row.value), 1);
        return rows.map((row) => ({ ...row, percent: (row.value / max) * 100 }));
    }, [data.carts, products]);

    /* Only requests still waiting on someone — settled ones are noise. */
    const openReturns = returns.filter(isReturnOpen).length;

    const topProducts = useMemo(() => {
        const counts = {};

        data.carts.forEach((cart) => {
            (cart.products || []).forEach((line) => {
                counts[line.id] = (counts[line.id] || 0) + line.quantity;
            });
        });

        return Object.entries(counts)
            .map(([id, qty]) => ({ product: products.find((item) => item.id === Number(id)), qty }))
            .filter((row) => row.product)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
    }, [data.carts, products]);

    if (error) {
        return (
            <div className="ad-empty-state" role="alert">
                <i className="bi bi-wifi-off" aria-hidden="true" />
                <h2>{error}</h2>
                <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="db-page">
            <header className="db-header">
                <div>
                    <h1>Dashboard</h1>
                    <p>A live snapshot of the storefront.</p>
                </div>

                {pendingChanges > 0 && (
                    <span className="db-pending">
                        <i className="bi bi-pencil-square" aria-hidden="true" />
                        {pendingChanges} local change{pendingChanges === 1 ? '' : 's'}
                    </span>
                )}
            </header>

            <div className="db-metrics">
                {loading
                    ? [0, 1, 2, 3].map((i) => <span className="db-skeleton is-card" key={i} />)
                    : [
                        { icon: 'bi-graph-up', tone: 'green', label: 'Revenue', value: format(metrics.revenue) },
                        { icon: 'bi-cart3', tone: 'violet', label: 'Carts', value: data.carts.length.toLocaleString() },
                        { icon: 'bi-people', tone: 'blue', label: 'Customers', value: data.users.toLocaleString() },
                        { icon: 'bi-box-seam', tone: 'amber', label: 'Products', value: products.length.toLocaleString() },
                    ].map((card) => (
                        <article className="db-metric" key={card.label}>
                            <span className={`db-metric-icon is-${card.tone}`} aria-hidden="true">
                                <i className={`bi ${card.icon}`} />
                            </span>
                            <div>
                                <span>{card.label}</span>
                                <strong>{card.value}</strong>
                            </div>
                        </article>
                    ))}
            </div>

            <div className="db-grid">
                <section className="db-card">
                    <h2>Sales by category</h2>

                    {loading ? (
                        <span className="db-skeleton" />
                    ) : byCategory.length === 0 ? (
                        <p className="db-muted">No sales data yet.</p>
                    ) : (
                        <ul className="db-bars">
                            {byCategory.map((row) => (
                                <li key={row.name}>
                                    <span className="db-bar-label">{row.name}</span>
                                    <span className="db-bar-track">
                                        <span className="db-bar-fill" style={{ width: `${row.percent}%` }} />
                                    </span>
                                    <span className="db-bar-value">{format(row.value)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="db-card">
                    <h2>Best sellers</h2>

                    {loading ? (
                        <span className="db-skeleton" />
                    ) : (
                        <ul className="db-top">
                            {topProducts.map(({ product, qty }, index) => (
                                <li key={product.id}>
                                    <span className="db-rank">{index + 1}</span>
                                    <span className="db-top-thumb">
                                        <img src={product.thumbnail} alt="" loading="lazy" />
                                    </span>
                                    <span className="db-top-info">
                                        <strong>{product.title}</strong>
                                        <small>{format(product.price)}</small>
                                    </span>
                                    <strong className="db-top-qty">{qty}</strong>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="db-card db-alerts-card">
                    <h2>Needs attention</h2>

                    {loading ? (
                        <span className="db-skeleton" />
                    ) : (
                        <ul className="db-alerts">
                            <li className={metrics.outOfStock.length ? 'is-bad' : 'is-ok'}>
                                <i className="bi bi-x-octagon" aria-hidden="true" />
                                <span>
                                    <strong>{metrics.outOfStock.length}</strong> out of stock
                                </span>
                                <Link to="/admin/inventory?filter=out">View</Link>
                            </li>

                            <li className={metrics.lowStock.length ? 'is-warn' : 'is-ok'}>
                                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                                <span>
                                    <strong>{metrics.lowStock.length}</strong> low on stock
                                </span>
                                <Link to="/admin/inventory?filter=low">View</Link>
                            </li>

                            <li className="is-info">
                                <i className="bi bi-cash-stack" aria-hidden="true" />
                                <span>
                                    <strong>{format(metrics.inventoryValue)}</strong> inventory value
                                </span>
                                <Link to="/admin/inventory">View</Link>
                            </li>

                            <li className="is-info">
                                <i className="bi bi-receipt" aria-hidden="true" />
                                <span>
                                    <strong>{format(metrics.avgOrder)}</strong> average cart
                                </span>
                                <Link to="/admin/orders">View</Link>
                            </li>

                            <li className={openReturns ? 'is-warn' : 'is-ok'}>
                                <i className="bi bi-arrow-return-left" aria-hidden="true" />
                                <span>
                                    <strong>{openReturns}</strong> return
                                    {openReturns === 1 ? '' : 's'} need a decision
                                </span>
                                <Link to="/admin/returns">View</Link>
                            </li>

                            <li className={breachedCount ? 'is-bad' : openTickets ? 'is-warn' : 'is-ok'}>
                                <i className="bi bi-life-preserver" aria-hidden="true" />
                                <span>
                                    <strong>{openTickets}</strong> open ticket
                                    {openTickets === 1 ? '' : 's'}
                                    {breachedCount > 0 && ` · ${breachedCount} past SLA`}
                                </span>
                                <Link to="/admin/support">View</Link>
                            </li>

                            <li className="is-info">
                                <i className="bi bi-heart-pulse" aria-hidden="true" />
                                <span>
                                    <strong>Catalogue</strong> data quality scan
                                </span>
                                <Link to="/admin/health">View</Link>
                            </li>
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
};

export default AdminDashboard;
