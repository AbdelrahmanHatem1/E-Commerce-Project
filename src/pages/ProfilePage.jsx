import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext.jsx';
import { useCart } from '../contexts/CartContext.jsx';
import { useWishlist } from '../contexts/WishlistContext.jsx';
import { useWallet, orderStatus } from '../contexts/WalletContext.jsx';
import { useAdmin } from '../contexts/AdminContext.jsx';
import { useCurrency } from '../contexts/CurrencyContext.jsx';
import { ThemeContext } from '../contexts/ThemeContext.jsx';
import { useNotification } from '../components/Notification.jsx';
import './ProfilePage.css';

const API = 'https://dummyjson.com';
const ORDER_HISTORY_KEY = 'shopstream_order_history';

const TABS = [
    { id: 'overview', label: 'My Profile', icon: 'bi-person' },
    { id: 'orders', label: 'Order History', icon: 'bi-clock-history' },
    { id: 'wishlist', label: 'Wishlist', icon: 'bi-heart' },
    { id: 'details', label: 'My Details', icon: 'bi-person-gear' },
    { id: 'settings', label: 'Account Settings', icon: 'bi-gear' },
];

/* Loyalty is 1 point per dollar spent, plus a joining bonus. The number
   is derived from real orders so it can never contradict the history. */
const LOYALTY_BONUS = 500;

/* Wallet = store credit. Modelled as 3% cash-back on delivered orders,
   which is why it only grows once an order is a week old. */
const CASHBACK_RATE = 0.03;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const ProfilePage = () => {
    const { user, logout } = useContext(AuthContext);
    const { isDarkMode, setIsDarkMode } = useContext(ThemeContext);
    const { cartCount } = useCart();
    const { wishlist, removeFromWishlist } = useWishlist();
    const { format, currency, setCurrency, currencies } = useCurrency();
    const { isAdmin, hasRole, role, demoMode, toggleDemoMode } = useAdmin();
    const {
        orders,
        balance,
        transactions,
        setOrderStage,
        isReturnable,
    } = useWallet();
    const { addToCart } = useCart();
    const { notify } = useNotification();

    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    /* /orders is an alias that opens this page straight on its tab. */
    const defaultTab = location.pathname === '/orders' ? 'orders' : 'overview';

    const activeTab = TABS.some((tab) => tab.id === searchParams.get('tab'))
        ? searchParams.get('tab')
        : defaultTab;

    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [expandedOrder, setExpandedOrder] = useState(null);


    const [form, setForm] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
    });

    /* -------------------------------------------------------------
       /auth/login returns nine fields with no address, so the full
       profile has to come from /auth/me.
       ------------------------------------------------------------- */
    useEffect(() => {
        /* No user yet? ProtectedRoute is still resolving the session —
           do not sit on a skeleton forever. */
        if (!user) {
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            setLoading(true);

            const applyBasics = (source) => {
                setProfile(source);
                setForm({
                    firstName: source.firstName || '',
                    lastName: source.lastName || '',
                    email: source.email || '',
                    phone: source.phone || '',
                    address: source.address?.address || '',
                    city: source.address?.city || '',
                    state: source.address?.state || '',
                    postalCode: source.address?.postalCode || '',
                    country: source.address?.country || '',
                });
            };

            const token = user.accessToken || user.token;

            if (!token) {
                applyBasics(user);
                setLoading(false);
                return;
            }

            try {
                const { data } = await axios.get(`${API}/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                });

                if (!cancelled) applyBasics(data);
            } catch (error) {
                const aborted =
                    axios.isCancel(error) ||
                    error.code === 'ERR_CANCELED' ||
                    error.name === 'CanceledError' ||
                    error.name === 'AbortError';

                if (!aborted && !cancelled) {
                    console.error('Failed to load the profile:', error);
                    /* Fall back to the login payload so the page still renders. */
                    applyBasics(user);
                }
            } finally {
                /* Always release the skeleton, even on an aborted request —
                   otherwise a fast unmount/remount leaves it spinning. */
                if (!cancelled) setLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [user]);

    useEffect(() => {
        document.title = 'My Account · ShopStream';
        return () => {
            document.title = 'ShopStream';
        };
    }, []);

    /* ----------------------------- derived --------------------------- */
    const stats = useMemo(() => {
        const totalSpent = orders.reduce((sum, order) => sum + (order.totals?.total ?? 0), 0);
        const itemCount = orders.reduce(
            (sum, order) => sum + (order.items?.reduce((n, item) => n + item.quantity, 0) ?? 0),
            0
        );

        /* "+N this month" on the orders tile. */
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const thisMonth = orders.filter(
            (order) => new Date(order.placedAt).getTime() >= monthStart.getTime()
        ).length;

        const loyalty = Math.round(totalSpent) + (orders.length > 0 ? LOYALTY_BONUS : 0);

        return { orderCount: orders.length, totalSpent, itemCount, thisMonth, loyalty };
    }, [orders]);

    /* Tier is earned, not decorative. */
    const tier = useMemo(() => {
        if (stats.totalSpent >= 2000) return { label: 'Platinum Member', tone: 'platinum' };
        if (stats.totalSpent >= 500) return { label: 'Premium Member', tone: 'premium' };
        if (stats.orderCount > 0) return { label: 'Verified Buyer', tone: 'verified' };
        return { label: 'New Member', tone: 'new' };
    }, [stats]);

    /* The oldest order marks when this account actually started buying. */
    const memberSince = useMemo(() => {
        if (orders.length === 0) return new Date().getFullYear();
        const oldest = orders.reduce((min, order) =>
            new Date(order.placedAt) < new Date(min.placedAt) ? order : min
        );
        return new Date(oldest.placedAt).getFullYear();
    }, [orders]);

    const setTab = (tab) => {
        const next = new URLSearchParams(searchParams);
        if (tab === defaultTab) next.delete('tab');
        else next.set('tab', tab);
        setSearchParams(next, { replace: true });
    };

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    /* ------------------------------ save ----------------------------- */
    const handleSave = async (event) => {
        event.preventDefault();

        if (!form.firstName.trim() || !form.lastName.trim()) {
            notify.error('Missing name', 'First and last name are required.');
            return;
        }

        if (!EMAIL_PATTERN.test(form.email)) {
            notify.error('Invalid email', 'Please enter a valid email address.');
            return;
        }

        setSaving(true);

        try {
            /* DummyJSON simulates the update and echoes the new values. */
            const { data } = await axios.put(`${API}/users/${user.id}`, {
                firstName: form.firstName,
                lastName: form.lastName,
                email: form.email,
                phone: form.phone,
            });

            setProfile((prev) => ({
                ...prev,
                ...data,
                address: {
                    ...prev?.address,
                    address: form.address,
                    city: form.city,
                    state: form.state,
                    postalCode: form.postalCode,
                    country: form.country,
                },
            }));

            notify.success('Your details were saved.');
        } catch (error) {
            console.error('Failed to save the profile:', error);
            notify.error(
                'We could not save your changes',
                error.response?.data?.message || 'Please try again in a moment.'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/', { replace: true });
    };

    const clearOrderHistory = () => {
        localStorage.removeItem(ORDER_HISTORY_KEY);
        notify.info('Local order history cleared.');
        setTimeout(() => window.location.reload(), 600);
    };

    const reorder = (order) => {
        let added = 0;

        order.items?.forEach((item) => {
            for (let index = 0; index < item.quantity; index += 1) {
                const ok = addToCart(item);
                if (ok !== false) added += 1;
            }
        });

        if (added > 0) navigate('/cart');
    };

    /* ------------------------------ guards --------------------------- */
    if (loading) {
        return (
            <main className="pr-page">
                <div className="pr-shell">
                    <div className="pr-skeleton-head">
                        <span className="pr-skeleton pr-skeleton-avatar" />
                        <div>
                            <span className="pr-skeleton pr-skeleton-line title" />
                            <span className="pr-skeleton pr-skeleton-line short" />
                        </div>
                    </div>
                    <div className="pr-skeleton-grid">
                        {[0, 1, 2, 3].map((index) => (
                            <span className="pr-skeleton pr-skeleton-card" key={index} />
                        ))}
                    </div>
                </div>
            </main>
        );
    }

    const displayName = `${form.firstName || profile?.firstName || ''} ${form.lastName || profile?.lastName || ''
        }`.trim();

    return (
        <main className="pr-page">
            <div className="pr-shell">
                <div className="pr-layout">
                    {/* --------------------------- sidebar --------------------------- */}
                    <aside className="pr-sidebar" aria-label="Account navigation">
                        <div className="pr-sidebar-head">
                            <h2>Account</h2>
                            <p>Manage your settings</p>
                        </div>

                        <nav className="pr-side-nav" role="tablist" aria-label="Account sections">
                            {TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === tab.id}
                                    className={`pr-side-link ${activeTab === tab.id ? 'is-active' : ''}`}
                                    onClick={() => setTab(tab.id)}
                                >
                                    <i className={`bi ${tab.icon}`} aria-hidden="true" />
                                    <span>{tab.label}</span>
                                    {tab.id === 'wishlist' && wishlist.length > 0 && (
                                        <span className="pr-side-count">{wishlist.length}</span>
                                    )}
                                    {tab.id === 'orders' && orders.length > 0 && (
                                        <span className="pr-side-count">{orders.length}</span>
                                    )}
                                </button>
                            ))}
                        </nav>

                        <button type="button" className="pr-side-logout" onClick={handleLogout}>
                            <i className="bi bi-box-arrow-right" aria-hidden="true" />
                            Sign Out
                        </button>
                    </aside>

                    <div className="pr-main">
                        {/* --------------------------- identity -------------------------- */}
                        <header className="pr-header">
                            <div className="pr-identity">
                                <div className="pr-avatar">
                                    {profile?.image ? (
                                        <img src={profile.image} alt="" />
                                    ) : (
                                        <span>{(displayName || 'U').charAt(0)}</span>
                                    )}
                                    <button
                                        type="button"
                                        className="pr-avatar-edit"
                                        onClick={() => setTab('details')}
                                        aria-label="Edit your details"
                                        title="Edit profile"
                                    >
                                        <i className="bi bi-pencil-fill" aria-hidden="true" />
                                    </button>
                                </div>

                                <div className="pr-identity-text">
                                    <h1>{displayName || 'Your account'}</h1>
                                    <p>{form.email || profile?.email}</p>

                                    <div className="pr-chips">
                                        <span className={`pr-chip is-${tier.tone}`}>{tier.label}</span>
                                        <span className="pr-chip is-muted">Member since {memberSince}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="pr-header-actions">
                                <button type="button" className="pr-primary-btn" onClick={() => setTab('details')}>
                                    Edit Profile
                                </button>
                                <button type="button" className="pr-ghost-btn" onClick={() => setTab('orders')}>
                                    View Analytics
                                </button>
                            </div>
                        </header>

                        {/* --------------------------- overview -------------------------- */}
                        {activeTab === 'overview' && (
                            <section className="pr-panel">
                                <div className="pr-stats">
                                    <article className="pr-stat">
                                        <div className="pr-stat-top">
                                            <span className="pr-stat-icon is-orders" aria-hidden="true">
                                                <i className="bi bi-bag" />
                                            </span>
                                            {stats.thisMonth > 0 && (
                                                <span className="pr-stat-delta">+{stats.thisMonth} this month</span>
                                            )}
                                        </div>
                                        <span className="pr-stat-label">Total Orders</span>
                                        <strong>{stats.orderCount}</strong>
                                    </article>

                                    <article className="pr-stat">
                                        <div className="pr-stat-top">
                                            <span className="pr-stat-icon is-spent" aria-hidden="true">
                                                <i className="bi bi-wallet2" />
                                            </span>
                                        </div>
                                        <span className="pr-stat-label">Wallet Balance</span>
                                        <strong>{format(balance)}</strong>
                                        <small>3% cash-back on delivered orders</small>
                                    </article>

                                    <article className="pr-stat">
                                        <div className="pr-stat-top">
                                            <span className="pr-stat-icon is-loyalty" aria-hidden="true">
                                                <i className="bi bi-star" />
                                            </span>
                                        </div>
                                        <span className="pr-stat-label">Loyalty Points</span>
                                        <strong>{stats.loyalty.toLocaleString()}</strong>
                                        <small>1 point per {format(1)} spent</small>
                                    </article>
                                </div>

                                {/* ------------------------ recent orders ---------------------- */}
                                <section className="pr-recent-card">
                                    <div className="pr-recent-head">
                                        <h2>Recent Orders</h2>
                                        {orders.length > 0 && (
                                            <button type="button" onClick={() => setTab('orders')}>
                                                View All
                                            </button>
                                        )}
                                    </div>

                                    {orders.length === 0 ? (
                                        <div className="pr-recent-empty">
                                            <i className="bi bi-bag" aria-hidden="true" />
                                            <p>No orders yet. Your purchases will show up here.</p>
                                            <Link to="/products">Start shopping</Link>
                                        </div>
                                    ) : (
                                        <ul className="pr-recent-list">
                                            {orders.slice(0, 3).map((order) => {
                                                const status = orderStatus(order);
                                                const first = order.items?.[0];
                                                const extra = (order.items?.length ?? 0) - 1;

                                                return (
                                                    <li className="pr-recent-row" key={order.orderNumber}>
                                                        <Link
                                                            to={first ? `/product/${first.id}` : '/products'}
                                                            className="pr-recent-thumb"
                                                        >
                                                            {first?.thumbnail ? (
                                                                <img src={first.thumbnail} alt="" loading="lazy" />
                                                            ) : (
                                                                <i className="bi bi-image" aria-hidden="true" />
                                                            )}
                                                        </Link>

                                                        <div className="pr-recent-info">
                                                            <strong>
                                                                {first?.title || 'Order'}
                                                                {extra > 0 && <span className="pr-recent-extra"> +{extra} more</span>}
                                                            </strong>
                                                            <span>
                                                                Order #{order.orderNumber} &nbsp;·&nbsp; Placed on{' '}
                                                                {formatDate(order.placedAt)}
                                                            </span>
                                                        </div>

                                                        <div className="pr-recent-right">
                                                            <strong>{format(order.totals?.total ?? 0)}</strong>

                                                            <div className="pr-recent-actions">
                                                                <span className={`pr-status is-${status.tone}`}>{status.label}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setTab('orders');
                                                                        setExpandedOrder(order.orderNumber);
                                                                    }}
                                                                >
                                                                    {status.tone === 'done' || status.tone === 'ship'
                                                                        ? 'Track Package'
                                                                        : 'View Order'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </section>

                                <div className="pr-overview-grid">
                                    <article className="pr-card">
                                        <div className="pr-card-head">
                                            <h2>
                                                <i className="bi bi-clock-history" aria-hidden="true" />
                                                Latest order
                                            </h2>
                                            {orders.length > 0 && (
                                                <button type="button" onClick={() => setTab('orders')}>
                                                    View all
                                                </button>
                                            )}
                                        </div>

                                        {orders.length === 0 ? (
                                            <div className="pr-mini-empty">
                                                <p>You have not placed an order yet.</p>
                                                <Link to="/products">Start shopping</Link>
                                            </div>
                                        ) : (
                                            <div className="pr-latest">
                                                <div className="pr-latest-head">
                                                    <strong>{orders[0].orderNumber}</strong>
                                                    <span className={`pr-status is-${orderStatus(orders[0]).tone}`}>
                                                        {orderStatus(orders[0]).label}
                                                    </span>
                                                </div>

                                                <div className="pr-latest-thumbs">
                                                    {orders[0].items?.slice(0, 4).map((item) => (
                                                        <span key={item.id}>
                                                            {item.thumbnail ? (
                                                                <img src={item.thumbnail} alt="" loading="lazy" />
                                                            ) : (
                                                                <i className="bi bi-image" aria-hidden="true" />
                                                            )}
                                                        </span>
                                                    ))}
                                                    {orders[0].items?.length > 4 && (
                                                        <span className="pr-more">+{orders[0].items.length - 4}</span>
                                                    )}
                                                </div>

                                                <p className="pr-latest-foot">
                                                    {formatDate(orders[0].placedAt)} ·{' '}
                                                    <strong>{format(orders[0].totals?.total ?? 0)}</strong>
                                                </p>
                                            </div>
                                        )}
                                    </article>

                                    <article className="pr-card">
                                        <div className="pr-card-head">
                                            <h2>
                                                <i className="bi bi-geo-alt" aria-hidden="true" />
                                                Default address
                                            </h2>
                                            <button type="button" onClick={() => setTab('details')}>
                                                Edit
                                            </button>
                                        </div>

                                        {form.address ? (
                                            <address className="pr-address">
                                                {displayName}
                                                <br />
                                                {form.address}
                                                <br />
                                                {form.city}, {form.state} {form.postalCode}
                                                <br />
                                                {form.country}
                                                {form.phone && (
                                                    <>
                                                        <br />
                                                        {form.phone}
                                                    </>
                                                )}
                                            </address>
                                        ) : (
                                            <div className="pr-mini-empty">
                                                <p>No shipping address saved yet.</p>
                                                <button type="button" onClick={() => setTab('details')}>
                                                    Add one
                                                </button>
                                            </div>
                                        )}
                                    </article>

                                    <article className="pr-card">
                                        <div className="pr-card-head">
                                            <h2>
                                                <i className="bi bi-wallet2" aria-hidden="true" />
                                                Wallet activity
                                            </h2>
                                            <Link to="/returns" className="pr-card-link">
                                                Returns
                                            </Link>
                                        </div>

                                        {transactions.length === 0 ? (
                                            <div className="pr-mini-empty">
                                                <p>No wallet activity yet.</p>
                                                <span>Cash-back lands when an order is delivered.</span>
                                            </div>
                                        ) : (
                                            <ul className="pr-txn-list">
                                                {transactions.slice(0, 4).map((txn) => (
                                                    <li key={txn.id}>
                                                        <span className={`pr-txn-icon is-${txn.kind}`} aria-hidden="true">
                                                            <i
                                                                className={`bi ${txn.kind === 'spend'
                                                                        ? 'bi-dash-lg'
                                                                        : txn.kind === 'refund'
                                                                            ? 'bi-arrow-counterclockwise'
                                                                            : 'bi-plus-lg'
                                                                    }`}
                                                            />
                                                        </span>
                                                        <span className="pr-txn-label">{txn.label}</span>
                                                        <strong className={txn.amount < 0 ? 'is-out' : 'is-in'}>
                                                            {txn.amount < 0 ? '-' : '+'}
                                                            {format(Math.abs(txn.amount))}
                                                        </strong>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </article>

                                    <article className="pr-card pr-quick-card">
                                        <div className="pr-card-head">
                                            <h2>
                                                <i className="bi bi-lightning-charge" aria-hidden="true" />
                                                Quick links
                                            </h2>
                                        </div>

                                        <div className="pr-quick-links">
                                            <Link to="/cart">
                                                <i className="bi bi-cart3" aria-hidden="true" />
                                                Cart
                                                {cartCount > 0 && <span>{cartCount}</span>}
                                            </Link>
                                            <Link to="/products">
                                                <i className="bi bi-grid" aria-hidden="true" />
                                                Browse products
                                            </Link>
                                            <Link to="/products?sort=discount">
                                                <i className="bi bi-tag" aria-hidden="true" />
                                                Today&apos;s deals
                                            </Link>
                                            <Link to="/support">
                                                <i className="bi bi-headset" aria-hidden="true" />
                                                Support
                                            </Link>
                                        </div>
                                    </article>
                                </div>
                            </section>
                        )}

                        {/* ---------------------------- orders --------------------------- */}
                        {activeTab === 'orders' && (
                            <section className="pr-panel">
                                {orders.length === 0 ? (
                                    <div className="pr-empty">
                                        <i className="bi bi-bag" aria-hidden="true" />
                                        <h2>No orders yet</h2>
                                        <p>Orders you place will appear here with their full history.</p>
                                        <Link to="/products">Start shopping</Link>
                                    </div>
                                ) : (
                                    <>
                                        <div className="pr-panel-head">
                                            <h2>Order history</h2>
                                            <button type="button" className="pr-text-button" onClick={clearOrderHistory}>
                                                <i className="bi bi-trash3" aria-hidden="true" />
                                                Clear history
                                            </button>
                                        </div>

                                        <ul className="pr-order-list">
                                            {orders.map((order) => {
                                                const status = orderStatus(order);
                                                const open = expandedOrder === order.orderNumber;
                                                const units =
                                                    order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

                                                return (
                                                    <li className={`pr-order ${open ? 'is-open' : ''}`} key={order.orderNumber}>
                                                        <button
                                                            type="button"
                                                            className="pr-order-head"
                                                            onClick={() => setExpandedOrder(open ? null : order.orderNumber)}
                                                            aria-expanded={open}
                                                        >
                                                            <div className="pr-order-id">
                                                                <strong>{order.orderNumber}</strong>
                                                                <span>{formatDate(order.placedAt)}</span>
                                                            </div>

                                                            <span className={`pr-status is-${status.tone}`}>{status.label}</span>

                                                            <div className="pr-order-sum">
                                                                <strong>{format(order.totals?.total ?? 0)}</strong>
                                                                <span>{units} item(s)</span>
                                                            </div>

                                                            <i
                                                                className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'} pr-order-caret`}
                                                                aria-hidden="true"
                                                            />
                                                        </button>

                                                        {open && (
                                                            <div className="pr-order-body">
                                                                <ul className="pr-order-items">
                                                                    {order.items?.map((item) => (
                                                                        <li key={`${order.orderNumber}-${item.id}`}>
                                                                            <Link to={`/product/${item.id}`} className="pr-order-thumb">
                                                                                {item.thumbnail ? (
                                                                                    <img src={item.thumbnail} alt="" loading="lazy" />
                                                                                ) : (
                                                                                    <i className="bi bi-image" aria-hidden="true" />
                                                                                )}
                                                                            </Link>

                                                                            <div className="pr-order-item-info">
                                                                                <Link to={`/product/${item.id}`}>{item.title}</Link>
                                                                                <span>
                                                                                    Qty: {item.quantity}
                                                                                    {item.selectedColor && ` · ${item.selectedColor}`}
                                                                                </span>
                                                                            </div>

                                                                            <strong>{format(item.price * item.quantity)}</strong>
                                                                        </li>
                                                                    ))}
                                                                </ul>

                                                                <div className="pr-order-foot">
                                                                    <div className="pr-order-ship">
                                                                        <span>Shipped to</span>
                                                                        <p>
                                                                            {order.shipping?.address}, {order.shipping?.city}{' '}
                                                                            {order.shipping?.zipCode}
                                                                        </p>
                                                                    </div>

                                                                    <div className="pr-order-buttons">
                                                                        {/* Delivery normally unlocks after a week — this
                                    jumps the order forward so the refund flow
                                    can be tried immediately. */}
                                                                        {status.tone !== 'done' && status.tone !== 'returned' && (
                                                                            <button
                                                                                type="button"
                                                                                className="pr-simulate"
                                                                                onClick={() => setOrderStage(order.orderNumber, 'delivered')}
                                                                            >
                                                                                <i className="bi bi-check2-all" aria-hidden="true" />
                                                                                Mark delivered
                                                                            </button>
                                                                        )}

                                                                        {isReturnable(order) && (
                                                                            <Link
                                                                                to={`/returns?order=${order.orderNumber}`}
                                                                                className="pr-return-link"
                                                                            >
                                                                                <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                                                                                Return items
                                                                            </Link>
                                                                        )}

                                                                        <button
                                                                            type="button"
                                                                            className="pr-reorder"
                                                                            onClick={() => reorder(order)}
                                                                        >
                                                                            <i className="bi bi-arrow-repeat" aria-hidden="true" />
                                                                            Buy again
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </>
                                )}
                            </section>
                        )}

                        {/* --------------------------- wishlist -------------------------- */}
                        {activeTab === 'wishlist' && (
                            <section className="pr-panel">
                                {wishlist.length === 0 ? (
                                    <div className="pr-empty">
                                        <i className="bi bi-heart" aria-hidden="true" />
                                        <h2>Your wishlist is empty</h2>
                                        <p>Tap the heart on any product to save it for later.</p>
                                        <Link to="/products">Browse products</Link>
                                    </div>
                                ) : (
                                    <>
                                        <div className="pr-panel-head">
                                            <h2>Saved items ({wishlist.length})</h2>
                                        </div>

                                        <div className="pr-wish-grid">
                                            {wishlist.map((item) => (
                                                <article className="pr-wish-card" key={item.id}>
                                                    <Link to={`/product/${item.id}`} className="pr-wish-media">
                                                        {item.thumbnail ? (
                                                            <img src={item.thumbnail} alt={item.title} loading="lazy" />
                                                        ) : (
                                                            <i className="bi bi-image" aria-hidden="true" />
                                                        )}
                                                    </Link>

                                                    <div className="pr-wish-body">
                                                        <Link to={`/product/${item.id}`} className="pr-wish-title">
                                                            {item.title}
                                                        </Link>
                                                        <strong>{format(item.price)}</strong>

                                                        <div className="pr-wish-actions">
                                                            <button type="button" onClick={() => addToCart(item)}>
                                                                <i className="bi bi-cart-plus" aria-hidden="true" />
                                                                Add to cart
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="pr-wish-remove"
                                                                onClick={() => {
                                                                    removeFromWishlist(item.id);
                                                                    notify.info(`${item.title} removed from your wishlist.`);
                                                                }}
                                                                aria-label={`Remove ${item.title}`}
                                                            >
                                                                <i className="bi bi-x-lg" aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </section>
                        )}

                        {/* --------------------------- details --------------------------- */}
                        {activeTab === 'details' && (
                            <section className="pr-panel">
                                <form className="pr-form" onSubmit={handleSave} noValidate>
                                    <div className="pr-form-block">
                                        <h2>Personal information</h2>

                                        <div className="pr-field-row">
                                            <div className="pr-field">
                                                <label htmlFor="firstName">First name</label>
                                                <input
                                                    id="firstName"
                                                    name="firstName"
                                                    value={form.firstName}
                                                    onChange={handleChange}
                                                    autoComplete="given-name"
                                                />
                                            </div>

                                            <div className="pr-field">
                                                <label htmlFor="lastName">Last name</label>
                                                <input
                                                    id="lastName"
                                                    name="lastName"
                                                    value={form.lastName}
                                                    onChange={handleChange}
                                                    autoComplete="family-name"
                                                />
                                            </div>
                                        </div>

                                        <div className="pr-field-row">
                                            <div className="pr-field">
                                                <label htmlFor="email">Email</label>
                                                <input
                                                    id="email"
                                                    name="email"
                                                    type="email"
                                                    value={form.email}
                                                    onChange={handleChange}
                                                    autoComplete="email"
                                                />
                                            </div>

                                            <div className="pr-field">
                                                <label htmlFor="phone">Phone</label>
                                                <input
                                                    id="phone"
                                                    name="phone"
                                                    type="tel"
                                                    value={form.phone}
                                                    onChange={handleChange}
                                                    autoComplete="tel"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pr-form-block">
                                        <h2>Shipping address</h2>

                                        <div className="pr-field">
                                            <label htmlFor="address">Street address</label>
                                            <input
                                                id="address"
                                                name="address"
                                                value={form.address}
                                                onChange={handleChange}
                                                autoComplete="street-address"
                                            />
                                        </div>

                                        <div className="pr-field-row pr-field-row--three">
                                            <div className="pr-field">
                                                <label htmlFor="city">City</label>
                                                <input id="city" name="city" value={form.city} onChange={handleChange} />
                                            </div>

                                            <div className="pr-field">
                                                <label htmlFor="state">State</label>
                                                <input id="state" name="state" value={form.state} onChange={handleChange} />
                                            </div>

                                            <div className="pr-field">
                                                <label htmlFor="postalCode">Postal code</label>
                                                <input
                                                    id="postalCode"
                                                    name="postalCode"
                                                    value={form.postalCode}
                                                    onChange={handleChange}
                                                />
                                            </div>
                                        </div>

                                        <div className="pr-field">
                                            <label htmlFor="country">Country</label>
                                            <input
                                                id="country"
                                                name="country"
                                                value={form.country}
                                                onChange={handleChange}
                                                autoComplete="country-name"
                                            />
                                        </div>
                                    </div>

                                    <div className="pr-form-actions">
                                        <button type="submit" className="pr-save" disabled={saving}>
                                            {saving ? (
                                                <>
                                                    <span className="pr-spinner" aria-hidden="true" />
                                                    Saving…
                                                </>
                                            ) : (
                                                <>
                                                    <i className="bi bi-check2" aria-hidden="true" />
                                                    Save changes
                                                </>
                                            )}
                                        </button>

                                        <p className="pr-form-note">
                                            <i className="bi bi-info-circle" aria-hidden="true" />
                                            Your address is used to pre-fill checkout.
                                        </p>
                                    </div>
                                </form>
                            </section>
                        )}

                        {/* --------------------------- settings -------------------------- */}
                        {activeTab === 'settings' && (
                            <section className="pr-panel">
                                <div className="pr-settings">
                                    <article className="pr-setting">
                                        <div>
                                            <h3>Appearance</h3>
                                            <p>Switch between the light and dark themes.</p>
                                        </div>

                                        <button
                                            type="button"
                                            className={`pr-switch ${isDarkMode ? 'is-on' : ''}`}
                                            onClick={() => setIsDarkMode(!isDarkMode)}
                                            role="switch"
                                            aria-checked={isDarkMode}
                                            aria-label="Dark mode"
                                        >
                                            <span className="pr-switch-knob">
                                                <i className={`bi ${isDarkMode ? 'bi-moon-stars-fill' : 'bi-sun-fill'}`} />
                                            </span>
                                        </button>
                                    </article>

                                    <article className="pr-setting">
                                        <div>
                                            <h3>Currency</h3>
                                            <p>Prices across the store are shown in this currency.</p>
                                        </div>

                                        <div className="pr-select-wrap">
                                            <select
                                                value={currency}
                                                onChange={(event) => {
                                                    setCurrency(event.target.value);
                                                    notify.success(`Prices now display in ${event.target.value}.`);
                                                }}
                                                aria-label="Currency"
                                            >
                                                {currencies.map((item) => (
                                                    <option key={item.code} value={item.code}>
                                                        {item.code} — {item.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <i className="bi bi-chevron-down" aria-hidden="true" />
                                        </div>
                                    </article>

                                    <article className="pr-setting">
                                        <div>
                                            <h3>Saved data</h3>
                                            <p>Clear the wishlist, browsing history and local orders.</p>
                                        </div>

                                        <button
                                            type="button"
                                            className="pr-danger"
                                            onClick={() => {
                                                [
                                                    'shopstream_saved_items',
                                                    'shopstream_recently_viewed',
                                                    ORDER_HISTORY_KEY,
                                                ].forEach((key) => localStorage.removeItem(key));
                                                notify.info('Local data cleared. Reloading…');
                                                setTimeout(() => window.location.reload(), 900);
                                            }}
                                        >
                                            <i className="bi bi-trash3" aria-hidden="true" />
                                            Clear local data
                                        </button>
                                    </article>

                                    <article className="pr-setting">
                                        <div>
                                            <h3>Admin panel</h3>
                                            <p>
                                                {hasRole
                                                    ? `Your account role is "${role}" — the dashboard is already unlocked.`
                                                    : 'Turn this on to preview the store management dashboard.'}
                                            </p>
                                        </div>

                                        <div className="pr-admin-controls">
                                            {isAdmin && (
                                                <Link to="/admin" className="pr-admin-link">
                                                    <i className="bi bi-speedometer2" aria-hidden="true" />
                                                    Open panel
                                                </Link>
                                            )}

                                            <button
                                                type="button"
                                                className={`pr-switch ${demoMode ? 'is-on' : ''}`}
                                                onClick={() => toggleDemoMode(!demoMode)}
                                                role="switch"
                                                aria-checked={demoMode}
                                                aria-label="Admin demo mode"
                                                disabled={hasRole}
                                                title={hasRole ? 'Already enabled by your role' : 'Enable admin mode'}
                                            >
                                                <span className="pr-switch-knob">
                                                    <i className={`bi ${demoMode ? 'bi-unlock-fill' : 'bi-lock-fill'}`} />
                                                </span>
                                            </button>
                                        </div>
                                    </article>

                                    <article className="pr-setting is-danger">
                                        <div>
                                            <h3>Sign out</h3>
                                            <p>End this session on the current device.</p>
                                        </div>

                                        <button type="button" className="pr-danger" onClick={handleLogout}>
                                            <i className="bi bi-box-arrow-right" aria-hidden="true" />
                                            Sign out
                                        </button>
                                    </article>
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
};

export default ProfilePage;
