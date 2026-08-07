import React, { useContext, useEffect, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext.jsx';
import { ThemeContext } from '../../contexts/ThemeContext.jsx';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { useAdmin } from '../../contexts/AdminContext.jsx';
import { useWallet, isReturnOpen } from '../../contexts/WalletContext.jsx';
import { useSupport } from '../../contexts/SupportContext.jsx';
import { ConfirmDialog } from './AdminModal.jsx';
import './AdminLayout.css';

const NAV = [
    { to: '/admin', label: 'Dashboard', icon: 'bi-speedometer2', end: true },
    { to: '/admin/inventory', label: 'Inventory', icon: 'bi-box-seam' },
    { to: '/admin/orders', label: 'Orders', icon: 'bi-cart3' },
    { to: '/admin/returns', label: 'Returns', icon: 'bi-arrow-return-left', badge: 'returns' },
    { to: '/admin/support', label: 'Support', icon: 'bi-life-preserver', badge: 'support' },
    { to: '/admin/customers', label: 'Customers', icon: 'bi-people' },
    { to: '/admin/builder', label: 'Site Builder', icon: 'bi-brush' },
    { to: '/admin/health', label: 'Data Health', icon: 'bi-heart-pulse' },
    { to: '/admin/storage', label: 'Storage', icon: 'bi-hdd' },
];

const AdminLayout = () => {
    const { user, logout } = useContext(AuthContext);
    const { isDarkMode, setIsDarkMode } = useContext(ThemeContext);
    const currency = useCurrency();
    const { returns } = useWallet();
    const { openCount: openTickets } = useSupport();
    const {
        isAdmin,
        role,
        roleLoading,
        demoMode,
        pendingChanges,
        changeBreakdown,
        resetAdminData,
    } = useAdmin();

    const navigate = useNavigate();
    const location = useLocation();
    const [navOpen, setNavOpen] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);

    useEffect(() => {
        document.title = 'Admin · ShopStream';
        return () => {
            document.title = 'ShopStream';
        };
    }, []);

    /* Changing route on mobile must close the drawer — otherwise it stays
       open over the page you just navigated to. */
    useEffect(() => {
        setNavOpen(false);
    }, [location.pathname]);

    /* Lock the page behind the mobile drawer. */
    useEffect(() => {
        if (!navOpen) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, [navOpen]);

    /* Escape closes the drawer — expected of anything modal-like. */
    useEffect(() => {
        if (!navOpen) return undefined;
        const onKey = (event) => {
            if (event.key === 'Escape') setNavOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [navOpen]);

    if (roleLoading) {
        return (
            <div className="ad-gate">
                <span className="ad-gate-spinner" aria-hidden="true" />
                <p>Checking your permissions…</p>
            </div>
        );
    }

    /* ProtectedRoute already guarantees a signed-in user, so anyone who
       lands here without the right role gets a clear explanation rather
       than a silent redirect. */
    if (!isAdmin) {
        return (
            <div className="ad-gate">
                <span className="ad-gate-icon" aria-hidden="true">
                    <i className="bi bi-shield-lock" />
                </span>
                <h1>Admin access required</h1>
                <p>
                    Your account role is <strong>{role || 'user'}</strong>. Only admin and moderator
                    accounts can open this area.
                </p>
                <div className="ad-gate-actions">
                    <Link to="/profile?tab=settings">Enable admin mode</Link>
                    <Link to="/" className="is-ghost">
                        Back to store
                    </Link>
                </div>
                <p className="ad-gate-hint">
                    <i className="bi bi-info-circle" aria-hidden="true" />
                    Tip: the DummyJSON account <strong>emilys</strong> already has the admin role.
                </p>
            </div>
        );
    }

    const handleLogout = () => {
        logout();
        navigate('/', { replace: true });
    };

    /* Requests still waiting on a decision — the badge means "someone is
       waiting on you", so settled rows must not count. */
    const openReturns = returns.filter(isReturnOpen).length;

    const currentPage =
        NAV.slice().reverse().find((item) =>
            item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
        ) || NAV[0];

    return (
        <div className="ad-shell">
            {/* --------------------------- sidebar --------------------------- */}
            <aside
                className={`ad-sidebar ${navOpen ? 'is-open' : ''}`}
                id="ad-sidebar"
                aria-hidden={undefined}
            >
                <div className="ad-brand">
                    <Link to="/">ShopStream</Link>
                    <span>Admin Panel</span>

                    <button
                        type="button"
                        className="ad-drawer-close"
                        onClick={() => setNavOpen(false)}
                        aria-label="Close navigation"
                    >
                        <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                </div>

                <nav className="ad-nav" aria-label="Admin sections">
                    {NAV.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) => `ad-nav-link ${isActive ? 'is-active' : ''}`}
                        >
                            <i className={`bi ${item.icon}`} aria-hidden="true" />
                            <span>{item.label}</span>
                            {item.badge === 'returns' && openReturns > 0 && (
                                <span className="ad-nav-badge" aria-label={`${openReturns} needing action`}>
                                    {openReturns}
                                </span>
                            )}
                            {item.badge === 'support' && openTickets > 0 && (
                                <span className="ad-nav-badge" aria-label={`${openTickets} open tickets`}>
                                    {openTickets}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="ad-sidebar-foot">
                    {/* --------------------- preferences --------------------- */}
                    <div className="ad-prefs">
                        <button
                            type="button"
                            className="ad-pref-btn"
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                            title={isDarkMode ? 'Light mode' : 'Dark mode'}
                        >
                            <i className={`bi ${isDarkMode ? 'bi-sun' : 'bi-moon-stars'}`} aria-hidden="true" />
                            <span>{isDarkMode ? 'Light' : 'Dark'}</span>
                        </button>

                        {/* CURRENCIES is an array of objects — Object.keys() on it
                returns "0","1","2"… which is exactly the meaningless
                number list this dropdown used to show. */}
                        {currency?.currencies?.length > 0 && (
                            <label className="ad-pref-select">
                                <span className="ad-sr-only">Display currency</span>
                                <select
                                    value={currency.currency}
                                    onChange={(event) => currency.setCurrency(event.target.value)}
                                    aria-label="Display currency"
                                    title="Currency used across every admin figure"
                                >
                                    {currency.currencies.map((item) => (
                                        <option key={item.code} value={item.code}>
                                            {item.symbol} {item.code}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>

                    {pendingChanges > 0 && (
                        <button type="button" className="ad-reset" onClick={() => setConfirmReset(true)}>
                            <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                            Reset {pendingChanges} change{pendingChanges === 1 ? '' : 's'}
                        </button>
                    )}

                    <Link to="/" className="ad-back-link">
                        <i className="bi bi-shop" aria-hidden="true" />
                        View storefront
                    </Link>

                    <div className="ad-user">
                        <span className="ad-user-avatar" aria-hidden="true">
                            {user?.image ? <img src={user.image} alt="" /> : (user?.firstName || 'A').charAt(0)}
                        </span>

                        <div className="ad-user-info">
                            <strong>
                                {user?.firstName} {user?.lastName}
                            </strong>
                            <span>{demoMode && !role ? 'demo mode' : role}</span>
                        </div>

                        <button type="button" onClick={handleLogout} aria-label="Sign out" title="Sign out">
                            <i className="bi bi-box-arrow-right" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </aside>

            {navOpen && (
                <button
                    type="button"
                    className="ad-backdrop"
                    onClick={() => setNavOpen(false)}
                    aria-label="Close navigation"
                />
            )}

            {/* ---------------------------- content -------------------------- */}
            <div className="ad-main">
                {/* Mobile top bar: menu, current section, quick theme switch. */}
                <header className="ad-topbar">
                    <button
                        type="button"
                        className="ad-menu-toggle"
                        onClick={() => setNavOpen(true)}
                        aria-label="Open navigation"
                        aria-expanded={navOpen}
                        aria-controls="ad-sidebar"
                    >
                        <i className="bi bi-list" aria-hidden="true" />
                    </button>

                    <span className="ad-topbar-title">
                        <i className={`bi ${currentPage.icon}`} aria-hidden="true" />
                        {currentPage.label}
                    </span>

                    <button
                        type="button"
                        className="ad-topbar-theme"
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        <i className={`bi ${isDarkMode ? 'bi-sun' : 'bi-moon-stars'}`} aria-hidden="true" />
                    </button>
                </header>

                <Outlet />
            </div>

            {/* ------------------------ reset confirmation ------------------- */}
            <ConfirmDialog
                open={confirmReset}
                onClose={() => setConfirmReset(false)}
                onConfirm={() => {
                    resetAdminData();
                    setConfirmReset(false);
                }}
                title="Reset all admin changes?"
                message="Every local edit will be discarded and the catalogue will return to the original API data. This cannot be undone."
                confirmLabel="Reset everything"
                cancelLabel="Keep my changes"
                footnote="Only affects this device"
            >
                <ul className="ad-reset-breakdown">
                    <li>
                        <i className="bi bi-pencil-square" aria-hidden="true" />
                        <strong>{changeBreakdown.edited}</strong> edited product
                        {changeBreakdown.edited === 1 ? '' : 's'}
                    </li>
                    <li>
                        <i className="bi bi-plus-square" aria-hidden="true" />
                        <strong>{changeBreakdown.created}</strong> product
                        {changeBreakdown.created === 1 ? '' : 's'} you created
                    </li>
                    <li>
                        <i className="bi bi-archive" aria-hidden="true" />
                        <strong>{changeBreakdown.deleted}</strong> archived product
                        {changeBreakdown.deleted === 1 ? '' : 's'} (will reappear)
                    </li>
                    {changeBreakdown.images > 0 && (
                        <li className="is-warn">
                            <i className="bi bi-images" aria-hidden="true" />
                            <strong>{changeBreakdown.images}</strong> uploaded image
                            {changeBreakdown.images === 1 ? '' : 's'} — gone for good
                        </li>
                    )}
                </ul>
            </ConfirmDialog>
        </div>
    );
};

export default AdminLayout;
