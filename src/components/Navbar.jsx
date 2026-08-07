import React, { useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { BsCart3, BsPerson, BsSearch, BsSun, BsMoon } from 'react-icons/bs';
import { IoMenuOutline, IoCloseOutline } from 'react-icons/io5';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../contexts/ThemeContext.jsx';
import { AuthContext } from '../contexts/AuthContext.jsx';
import { useCart } from '../contexts/CartContext.jsx';
import { useWishlist } from '../contexts/WishlistContext.jsx';
import { useWallet } from '../contexts/WalletContext.jsx';
import { useAdmin } from '../contexts/AdminContext.jsx';
import { useOptionalLayout } from '../contexts/LayoutContext.jsx';
import { useNotification } from './Notification.jsx';
import './Navbar.css';
import Logo from './Logo.jsx';

const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Products', to: '/products' },
  { label: 'Categories', to: '/categories' },
  { label: 'Support', to: '/support' },
];

const Navbar = () => {
  const { isDarkMode, setIsDarkMode } = useContext(ThemeContext);
  const { user, logout } = useContext(AuthContext);
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const { activeOrderCount } = useWallet();
  const { isAdmin } = useAdmin();
  const { navPages } = useOptionalLayout();

  /* Admin-built pages sit after the fixed links. Capped so a long list
     cannot push the cart and account controls off the bar. */
  const links = useMemo(
    () => [
      ...NAV_LINKS,
      ...navPages
        .slice(0, 4)
        .map((page) => ({ label: page.navLabel || page.name, to: `/p/${page.slug}` })),
    ],
    [navPages]
  );
  const { notify } = useNotification();

  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  /* Deepens the frosted glass once content scrolls under the bar.
     Read from the scroll position on mount too, because a reload part
     way down the page would otherwise start with the transparent bar
     over real content. */
  const [isScrolled, setIsScrolled] = useState(
    () => typeof window !== 'undefined' && window.scrollY > 8
  );

  useEffect(() => {
    /* passive: this listener never calls preventDefault, and saying so
       lets the browser keep scrolling on the compositor thread. */
    const onScroll = () => setIsScrolled(window.scrollY > 8);

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const profileRef = useRef(null);
  const profileButtonRef = useRef(null);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const closeMenus = useCallback(() => {
    setIsMobileMenuOpen(false);
    setIsProfileMenuOpen(false);
  }, []);

  /* 1) Close everything whenever the route changes. Without this the
        mobile overlay stays open on top of the new page. */
  useEffect(() => {
    closeMenus();
  }, [location.pathname, location.search, closeMenus]);

  /* 2) Close the profile dropdown on an outside click. */
  useEffect(() => {
    if (!isProfileMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (profileRef.current?.contains(event.target)) return;
      setIsProfileMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isProfileMenuOpen]);

  /* 3) Escape closes whatever is open and returns focus sensibly. */
  useEffect(() => {
    if (!isProfileMenuOpen && !isMobileMenuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;

      if (isProfileMenuOpen) profileButtonRef.current?.focus();
      closeMenus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isProfileMenuOpen, isMobileMenuOpen, closeMenus]);

  /* 4) Lock the page behind the full-screen mobile overlay. */
  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previous;
    };
  }, [isMobileMenuOpen]);

  /* 5) Keep the field in sync with the URL when the visitor lands on
        a page that already carries a ?q= term. */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchTerm(params.get('q') || '');
  }, [location.search]);

  /* --------------------------- search --------------------------- */
  const handleSearch = (event) => {
    event.preventDefault();

    const term = searchTerm.trim();

    if (!term) {
      notify.info('Type something to search for.');
      return;
    }

    closeMenus();
    navigate(`/products?q=${encodeURIComponent(term)}`);
  };

  /* --------------------------- logout --------------------------- */
  const handleLogout = () => {
    closeMenus();
    logout();
    navigate('/', { replace: true });
  };

  return (
    <nav
      className={`navbar-main ${isDarkMode ? 'dark' : 'light'} ${isScrolled ? 'is-scrolled' : ''
        }`}
    >
      <div className="nav-container">
        {/* ---------------------------- logo ---------------------------- */}
        <div className="nav-left">
          <Link to="/" className="nav-brand" aria-label="ShopStream — go to the home page">
            <Logo size={30} />
          </Link>
        </div>

        {/* ------------------------ desktop links ----------------------- */}
        <div className="nav-center d-none d-lg-flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => `nav-link-item ${isActive ? 'is-active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* --------------------------- actions -------------------------- */}
        <div className="nav-right">
          <form className="nav-search d-none d-md-flex" onSubmit={handleSearch} role="search">
            <button type="submit" className="nav-search-submit" aria-label="Search products">
              <BsSearch className="search-icon" />
            </button>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search products..."
              aria-label="Search products"
            />
            {searchTerm && (
              <button
                type="button"
                className="nav-search-clear"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                <IoCloseOutline />
              </button>
            )}
          </form>

          <button
            type="button"
            onClick={toggleTheme}
            className="icon-btn theme-btn"
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDarkMode ? 'Light mode' : 'Dark mode'}
          >
            {isDarkMode ? <BsSun /> : <BsMoon />}
          </button>

          <Link
            to="/cart#saved-items"
            className="icon-btn wish-btn"
            aria-label={
              wishlistCount > 0 ? `Wishlist, ${wishlistCount} item(s)` : 'Wishlist, empty'
            }
            title="Saved items"
          >
            <i className={`bi ${wishlistCount > 0 ? 'bi-heart-fill' : 'bi-heart'}`} aria-hidden="true" />
            {wishlistCount > 0 && (
              <span className="wish-badge">{wishlistCount > 99 ? '99+' : wishlistCount}</span>
            )}
          </Link>

          <Link
            to="/cart"
            className="icon-btn cart-btn"
            aria-label={cartCount > 0 ? `Cart, ${cartCount} item(s)` : 'Cart, empty'}
          >
            <BsCart3 />
            {cartCount > 0 && (
              <span className="cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>
            )}
          </Link>

          {/* ------------------------- profile ------------------------- */}
          <div className="profile-section" ref={profileRef}>
            <button
              type="button"
              ref={profileButtonRef}
              onClick={() => setIsProfileMenuOpen((open) => !open)}
              className="icon-btn profile-btn"
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
              aria-label={user ? `Account menu for ${user.firstName}` : 'Account menu'}
            >
              <BsPerson />
              {user && <span className="user-dot" aria-hidden="true" />}
            </button>

            {isProfileMenuOpen && (
              <div className="profile-dropdown-menu" role="menu">
                {user ? (
                  <>
                    <div className="user-info-header">
                      <p className="user-greet">Hello, {user.firstName}</p>
                      {user.email && <p className="user-email">{user.email}</p>}
                    </div>

                    <Link to="/profile" className="dropdown-link" role="menuitem">
                      <i className="bi bi-person" aria-hidden="true" />
                      My Profile
                    </Link>
                    <Link to="/orders" className="dropdown-link" role="menuitem">
                      <i className="bi bi-bag-check" aria-hidden="true" />
                      Orders
                      {activeOrderCount > 0 && (
                        <span
                          className="dropdown-pill"
                          title={`${activeOrderCount} order(s) in progress`}
                        >
                          {activeOrderCount}
                        </span>
                      )}
                    </Link>
                    <Link to="/cart" className="dropdown-link" role="menuitem">
                      <i className="bi bi-cart3" aria-hidden="true" />
                      Cart {cartCount > 0 && <span className="dropdown-pill">{cartCount}</span>}
                    </Link>

                    {isAdmin && (
                      <Link to="/admin" className="dropdown-link is-admin" role="menuitem">
                        <i className="bi bi-speedometer2" aria-hidden="true" />
                        Admin Panel
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="dropdown-logout"
                      role="menuitem"
                    >
                      <i className="bi bi-box-arrow-right" aria-hidden="true" />
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <div className="user-info-header">
                      <p className="user-greet">Welcome to ShopStream</p>
                      <p className="user-email">Sign in for a faster checkout.</p>
                    </div>

                    <Link to="/login" className="dropdown-link" role="menuitem">
                      <i className="bi bi-box-arrow-in-right" aria-hidden="true" />
                      Login
                    </Link>
                    <Link to="/register" className="dropdown-link" role="menuitem">
                      <i className="bi bi-person-plus" aria-hidden="true" />
                      Register
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className="mobile-toggle-btn d-lg-none"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-nav"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {isMobileMenuOpen ? <IoCloseOutline /> : <IoMenuOutline />}
          </button>
        </div>
      </div>

      {/* ------------------------- mobile menu ------------------------- */}
      <div
        id="mobile-nav"
        className={`mobile-nav-overlay ${isMobileMenuOpen ? 'active' : ''}`}
        aria-hidden={!isMobileMenuOpen}
      >
        <div className="mobile-nav-content">
          <form className="mobile-search" onSubmit={handleSearch} role="search">
            <button type="submit" aria-label="Search products">
              <BsSearch />
            </button>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search..."
              aria-label="Search products"
              tabIndex={isMobileMenuOpen ? 0 : -1}
            />
          </form>

          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
              tabIndex={isMobileMenuOpen ? 0 : -1}
            >
              {link.label}
            </NavLink>
          ))}

          <Link to="/cart" className="mobile-cart-link" tabIndex={isMobileMenuOpen ? 0 : -1}>
            Cart
            {cartCount > 0 && <span className="dropdown-pill">{cartCount}</span>}
          </Link>

          <div className="mobile-nav-footer">
            {user ? (
              <button type="button" className="dropdown-logout" onClick={handleLogout}>
                <i className="bi bi-box-arrow-right" aria-hidden="true" />
                Logout
              </button>
            ) : (
              <>
                <Link to="/login" className="mobile-auth-link" tabIndex={isMobileMenuOpen ? 0 : -1}>
                  Login
                </Link>
                <Link
                  to="/register"
                  className="mobile-auth-link is-primary"
                  tabIndex={isMobileMenuOpen ? 0 : -1}
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
