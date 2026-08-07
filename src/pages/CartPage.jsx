import React, { useMemo } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../contexts/CartContext.jsx';
import { useWishlist } from '../contexts/WishlistContext.jsx';
import { useNotification } from '../components/Notification.jsx';
import cartEmptyIllustration from './assets/cart-empty-illustration.png';
import searchHelpIllustration from './assets/search-help-illustration.png';
import './CartPage.css';

/* These map onto the CATEGORY_GROUPS ids in ProductsPage.jsx, which
   reads them from the `cat` search param. Changing an id here without
   changing it there silently breaks the link, so keep them in sync. */
const popularCategories = [
  { label: 'Electronics', icon: 'bi-laptop', href: '/products?cat=electronics' },
  { label: 'Fashion', icon: 'bi-bag', href: '/products?cat=fashion' },
  { label: 'Home', icon: 'bi-house', href: '/products?cat=home' },
  { label: 'Sports', icon: 'bi-activity', href: '/products?cat=sports' },
  { label: 'Beauty', icon: 'bi-star', href: '/products?cat=beauty' },
  { label: 'Top Rated', icon: 'bi-star-fill', href: '/products?rating=4&sort=rating' },
  { label: 'Best Deals', icon: 'bi-tag', href: '/products?sort=discount' },
  { label: 'All Shop', icon: 'bi-grid', href: '/products' },
];

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const getItemSubtitle = (item) => {
  /* selectedColor is attached by ProductDetailsPage when the shopper
     picks a swatch, so the choice survives all the way to checkout. */
  const details = [item.selectedColor, item.brand, item.category?.replace(/-/g, ' ')].filter(
    Boolean
  );
  return details.length ? details.join(' | ') : 'Premium ShopStream item';
};

/* ----------------------------------------------------------------
   Empty-cart hero
   ---------------------------------------------------------------- */
const EmptyCartHero = ({ onViewSavedItems, savedCount }) => (
  <section className="empty-cart-hero" aria-labelledby="empty-cart-title">
    <div className="empty-cart-content">
      <div className="cart-illustration-shell" aria-hidden="true">
        <span className="cart-float-icon cart-float-icon--bag">
          <i className="bi bi-bag" />
        </span>
        <img className="cart-empty-illustration" src={cartEmptyIllustration} alt="" />
        <span className="cart-float-icon cart-float-icon--check">
          <i className="bi bi-bag-check" />
        </span>
      </div>

      <h1 id="empty-cart-title">Your cart is feeling light</h1>
      <p className="empty-cart-description">
        It looks like you haven&apos;t added anything to your cart yet.
        <br />
        Let&apos;s find something special for you.
      </p>

      <div className="empty-cart-actions">
        <Link className="cart-primary-button" to="/products">
          Start Shopping
        </Link>

        <button className="cart-secondary-button" type="button" onClick={onViewSavedItems}>
          View Saved Items
          {savedCount > 0 && <span className="cart-saved-count">{savedCount}</span>}
        </button>
      </div>
    </div>
  </section>
);

/* ----------------------------------------------------------------
   Saved for later — real items pulled from localStorage
   ---------------------------------------------------------------- */
const SavedItemsPanel = ({ savedItems, onMoveToCart, onRemoveSaved }) => (
  <section className="saved-items-panel" id="saved-items" aria-labelledby="saved-items-title">
    <div className="saved-items-head">
      <div>
        <h2 id="saved-items-title">
          <i className="bi bi-bookmark-heart" aria-hidden="true" />
          Saved for later
        </h2>
        <p>{savedItems.length} item(s) waiting for you.</p>
      </div>
    </div>

    <div className="saved-items-grid">
      {savedItems.map((item) => (
        <article className="saved-item-card" key={item.id}>
          <div className="saved-item-thumb">
            {item.thumbnail ? (
              <img src={item.thumbnail} alt={item.title} />
            ) : (
              <i className="bi bi-image" aria-hidden="true" />
            )}
          </div>

          <div className="saved-item-body">
            <h3 title={item.title}>{item.title}</h3>
            <strong>{money.format(Number(item.price || 0))}</strong>
          </div>

          <div className="saved-item-actions">
            <button type="button" className="saved-move" onClick={() => onMoveToCart(item)}>
              <i className="bi bi-cart-plus" aria-hidden="true" />
              Move to cart
            </button>
            <button
              type="button"
              className="saved-remove"
              onClick={() => onRemoveSaved(item)}
              aria-label={`Remove ${item.title} from saved items`}
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>
        </article>
      ))}
    </div>
  </section>
);

/* ----------------------------------------------------------------
   Search help — only shown when a real ?q= search returned nothing
   ---------------------------------------------------------------- */
const CartEmptyHelp = ({ searchTerm, onStartLiveChat, onClearSearch }) => (
  <section className="cart-empty-help" id="cart-help" aria-labelledby="no-results-title">
    <div className="empty-help-heading">
      <div className="empty-search-icon" aria-hidden="true">
        <i className="bi bi-search" />
      </div>

      {searchTerm ? (
        <>
          <h2 id="no-results-title">
            No results for <span>&quot;{searchTerm}&quot;</span>
          </h2>
          <p>We couldn&apos;t find exactly what you were looking for.</p>
          <button type="button" className="clear-search-button" onClick={onClearSearch}>
            <i className="bi bi-x-circle" aria-hidden="true" />
            Clear search
          </button>
        </>
      ) : (
        <>
          <h2 id="no-results-title">Not sure where to start?</h2>
          <p>Here are a few shortcuts to help you find the right item.</p>
        </>
      )}
    </div>

    <div className="empty-help-grid">
      <article className="quick-fix-card">
        <div className="quick-fix-copy">
          <h3>{searchTerm ? 'Need a quick fix?' : 'Shopping tips'}</h3>
          <ul>
            <li>
              <i className="bi bi-check2-circle" aria-hidden="true" />
              Check your spelling for any typos.
            </li>
            <li>
              <i className="bi bi-check2-circle" aria-hidden="true" />
              Try using more general keywords.
            </li>
            <li>
              <i className="bi bi-check2-circle" aria-hidden="true" />
              Use the filters to broaden your search.
            </li>
          </ul>
        </div>
        <img src={searchHelpIllustration} alt="" />
      </article>

      <article className="live-chat-card">
        <i className="bi bi-chat-dots live-chat-icon" aria-hidden="true" />
        <h3>Chat with us</h3>
        <p>Our shopping assistants are online and ready to help you find the right item.</p>
        <button type="button" onClick={onStartLiveChat}>
          <i className="bi bi-chat-square-text" aria-hidden="true" />
          Start Live Chat
        </button>
      </article>
    </div>

    <div className="popular-categories">
      <p className="popular-categories-label">Browse popular categories</p>
      <div className="popular-categories-grid">
        {popularCategories.map((category) => (
          <Link key={category.label} to={category.href} className="popular-category-link">
            <i className={`bi ${category.icon}`} aria-hidden="true" />
            <span>{category.label}</span>
          </Link>
        ))}
      </div>
    </div>
  </section>
);

/* ----------------------------------------------------------------
   Filled cart
   ---------------------------------------------------------------- */
const FilledCart = ({
  cartItems,
  onDecrease,
  onIncrease,
  onRemove,
  onSaveForLater,
  onCheckout,
  onClearCart,
}) => {
  const subtotal = cartItems.reduce(
    (total, item) => total + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );
  const estimatedTax = subtotal * 0.08;
  const total = subtotal + estimatedTax;
  const unitCount = cartItems.reduce((count, item) => count + item.quantity, 0);

  return (
    <main className="cart-page cart-page--filled">
      <section className="filled-cart-layout" aria-labelledby="cart-page-title">
        <div className="cart-items-panel">
          <div className="cart-heading-row">
            <h1 id="cart-page-title">Your Shopping Cart</h1>
            <span>
              {cartItems.length} {cartItems.length === 1 ? 'product' : 'products'} · {unitCount}{' '}
              item(s)
            </span>
          </div>

          <div className="cart-item-list">
            {cartItems.map((item) => (
              <article className="cart-item-card" key={item.id}>
                <div className="cart-product-image-wrap">
                  <img
                    src={item.thumbnail || item.images?.[0]}
                    alt={item.title}
                    className="cart-product-image"
                    loading="lazy"
                  />
                </div>

                <div className="cart-product-details">
                  <h2>{item.title}</h2>
                  <p>{getItemSubtitle(item)}</p>

                  <div className="cart-quantity-control" aria-label={`Quantity for ${item.title}`}>
                    <button
                      type="button"
                      onClick={() => onDecrease(item)}
                      aria-label={`Decrease quantity of ${item.title}`}
                      disabled={item.quantity <= 1}
                    >
                      <i className="bi bi-dash" aria-hidden="true" />
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onIncrease(item)}
                      aria-label={`Increase quantity of ${item.title}`}
                    >
                      <i className="bi bi-plus" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="cart-item-actions">
                  <strong>
                    {money.format(Number(item.price || 0) * Number(item.quantity || 1))}
                  </strong>

                  <div className="cart-item-links">
                    <button type="button" className="save-later" onClick={() => onSaveForLater(item)}>
                      <i className="bi bi-bookmark" aria-hidden="true" />
                      Save
                    </button>
                    <button type="button" onClick={() => onRemove(item)}>
                      <i className="bi bi-trash3" aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="cart-list-footer">
            <Link to="/products" className="continue-shopping-link">
              <i className="bi bi-arrow-left-short" aria-hidden="true" />
              Continue shopping
            </Link>

            <button type="button" className="clear-cart-button" onClick={onClearCart}>
              <i className="bi bi-x-circle" aria-hidden="true" />
              Clear cart
            </button>
          </div>
        </div>

        <aside className="order-summary" aria-label="Order summary">
          <h2>Order Summary</h2>

          <dl className="summary-breakdown">
            <div>
              <dt>Subtotal</dt>
              <dd>{money.format(subtotal)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd className="free-shipping">Free</dd>
            </div>
            <div>
              <dt>Estimated Tax</dt>
              <dd>{money.format(estimatedTax)}</dd>
            </div>
          </dl>

          <div className="summary-total">
            <span>Total</span>
            <strong>{money.format(total)}</strong>
          </div>

          <button className="checkout-button" type="button" onClick={onCheckout}>
            Proceed to Checkout
            <i className="bi bi-arrow-right" aria-hidden="true" />
          </button>

          <p className="checkout-note">
            By proceeding to checkout, you agree to ShopStream&apos;s terms and privacy policy.
          </p>

          <div className="delivery-note">
            <i className="bi bi-truck" aria-hidden="true" />
            <div>
              <strong>Free Express Delivery</strong>
              <span>Arrives in 3–5 business days</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
};

/* ----------------------------------------------------------------
   Cart page
   ---------------------------------------------------------------- */
const Cart = () => {
  const { cartItems, updateQuantity, removeFromCart, clearCart, addToCart, isLoggedIn } = useCart();
  const { wishlist: savedItems, toggleWishlist, removeFromWishlist } = useWishlist();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* A real search term, not a hard-coded product name. */
  const searchTerm = (searchParams.get('q') || '').trim();

  const scrollToSavedItems = () => {
    const target =
      document.getElementById('saved-items') || document.getElementById('cart-help');

    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (savedItems.length === 0) {
      notify.info('You have no saved items yet — here are some ideas instead.');
    }
  };

  const startLiveChat = () => {
    notify.info('A shopping assistant will be with you shortly.');
  };

  const clearSearch = () => {
    searchParams.delete('q');
    setSearchParams(searchParams, { replace: true });
    notify.info('Search cleared.');
  };

  /* ---------------------------- cart ---------------------------- */
  const decreaseQuantity = (item) => {
    if (item.quantity <= 1) return;
    updateQuantity(item.id, item.quantity - 1);
  };

  const increaseQuantity = (item) => {
    updateQuantity(item.id, item.quantity + 1);
  };

  const removeItem = (item) => {
    removeFromCart(item.id);
    notify.info(`${item.title} was removed from your cart.`);
  };

  const handleClearCart = () => {
    if (cartItems.length === 0) return;
    clearCart();
    notify.info('Your cart is now empty.');
  };

  /* ------------------------ saved for later ---------------------- */
  const saveForLater = (item) => {
    const alreadySaved = savedItems.some((saved) => saved.id === item.id);
    if (!alreadySaved) toggleWishlist(item);

    removeFromCart(item.id);
  };

  const moveToCart = (item) => {
    /* CartContext handles the sign-in guard and the notification. */
    const added = addToCart(item);
    if (added === false) return;

    removeFromWishlist(item.id);
  };

  const removeSaved = (item) => {
    toggleWishlist(item);
  };

  const proceedToCheckout = () => {
    if (!isLoggedIn) {
      notify.warning('Please sign in to continue to checkout.');
      navigate('/login', { state: { from: { pathname: '/checkout' } } });
      return;
    }

    navigate('/checkout');
  };

  const hasSaved = savedItems.length > 0;

  const emptyBody = useMemo(
    () => (
      <>
        {hasSaved && (
          <SavedItemsPanel
            savedItems={savedItems}
            onMoveToCart={moveToCart}
            onRemoveSaved={removeSaved}
          />
        )}

        <CartEmptyHelp
          searchTerm={searchTerm}
          onStartLiveChat={startLiveChat}
          onClearSearch={clearSearch}
        />
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasSaved, savedItems, searchTerm]
  );

  if (cartItems.length > 0) {
    return (
      <FilledCart
        cartItems={cartItems}
        onDecrease={decreaseQuantity}
        onIncrease={increaseQuantity}
        onRemove={removeItem}
        onSaveForLater={saveForLater}
        onCheckout={proceedToCheckout}
        onClearCart={handleClearCart}
      />
    );
  }

  return (
    <main className="cart-page">
      <EmptyCartHero onViewSavedItems={scrollToSavedItems} savedCount={savedItems.length} />
      {emptyBody}
    </main>
  );
};

export default Cart;
