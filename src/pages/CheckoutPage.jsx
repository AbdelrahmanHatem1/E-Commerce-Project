import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext.jsx';
import { useWallet } from '../contexts/WalletContext.jsx';
import { AuthContext } from '../contexts/AuthContext.jsx';
import { useNotification } from '../components/Notification.jsx';
import './CheckoutPage.css';

const API = 'https://dummyjson.com';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

/* Promo codes the store honours. DummyJSON has no coupon endpoint,
   so this stays local on purpose. */
const PROMO_CODES = {
  SHOP10: { label: '10% off your order', type: 'percent', value: 0.1 },
  WELCOME5: { label: '$5 off your order', type: 'fixed', value: 5 },
  FREESHIP: { label: 'Free express shipping', type: 'fixed', value: 0 },
};

const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Egypt',
  'Saudi Arabia',
  'United Arab Emirates',
  'Germany',
  'France',
];

const STEPS = [
  { id: 1, label: 'Shipping' },
  { id: 2, label: 'Payment' },
  { id: 3, label: 'Review' },
];

/* The key the confirmation page will read the placed order from. */
export const LAST_ORDER_KEY = 'shopstream_last_order';
export const ORDER_HISTORY_KEY = 'shopstream_order_history';

/* ----------------------------------------------------------------
   Progress stepper — clickable, scrolls to the matching section
   ---------------------------------------------------------------- */
const CheckoutStepper = ({ currentStep, onStepClick }) => (
  <ol className="checkout-stepper" aria-label="Checkout progress">
    {STEPS.map((step, index) => {
      const state =
        currentStep > step.id ? 'done' : currentStep === step.id ? 'active' : 'idle';

      return (
        <li className={`checkout-step is-${state}`} key={step.id}>
          <button
            type="button"
            className="checkout-step-button"
            onClick={() => onStepClick(step.id)}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <span className="checkout-step-bullet" aria-hidden="true">
              {state === 'done' ? <i className="bi bi-check2" /> : step.id}
            </span>
            <span className="checkout-step-label">{step.label}</span>
          </button>

          {index < STEPS.length - 1 && <span className="checkout-step-line" aria-hidden="true" />}
        </li>
      );
    })}
  </ol>
);

/* ----------------------------------------------------------------
   Stock badge driven by the live /products/{id} response
   ---------------------------------------------------------------- */
const StockBadge = ({ meta }) => {
  if (!meta) return null;

  if (meta.stock === 0) {
    return (
      <span className="checkout-stock is-out">
        <i className="bi bi-x-octagon-fill" aria-hidden="true" />
        Out of stock
      </span>
    );
  }

  if (meta.stock <= 5) {
    return (
      <span className="checkout-stock is-low">
        <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
        Only {meta.stock} left!
      </span>
    );
  }

  if (meta.availabilityStatus && meta.availabilityStatus !== 'In Stock') {
    return (
      <span className="checkout-stock is-low">
        <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
        {meta.availabilityStatus}
      </span>
    );
  }

  return (
    <span className="checkout-stock is-in">
      <i className="bi bi-check-circle-fill" aria-hidden="true" />
      In stock
    </span>
  );
};

/* ----------------------------------------------------------------
   Order summary sidebar
   ---------------------------------------------------------------- */
const OrderSummary = ({
  cartItems,
  productMeta,
  metaLoading,
  subtotal,
  shipping,
  tax,
  discount,
  total,
  promoInput,
  onPromoInputChange,
  onApplyPromo,
  onRemovePromo,
  appliedPromo,
  onIncrease,
  onDecrease,
  onRemoveItem,
  shippingInfo,
  returnPolicy,
  walletBalance,
  walletApplied,
  useWalletCredit,
  onToggleWallet,
}) => (
  <aside className="checkout-summary" aria-label="Order summary">
    <div className="checkout-summary-head">
      <h2>Order Summary</h2>
      <Link to="/cart" className="checkout-edit-cart">
        <i className="bi bi-arrow-left-short" aria-hidden="true" />
        Edit cart
      </Link>
    </div>

    <ul className="checkout-summary-items">
      {cartItems.map((item) => {
        const meta = productMeta[item.id];
        const maxReached = meta ? item.quantity >= meta.stock : false;

        return (
          <li className="checkout-summary-item" key={item.id}>
            <div className="checkout-summary-thumb">
              <img src={item.thumbnail || item.images?.[0]} alt={item.title} />
            </div>

            <div className="checkout-summary-info">
              <h3 title={item.title}>{item.title}</h3>
              {item.selectedColor && <span className="checkout-variant">{item.selectedColor}</span>}
              <strong>{money.format(Number(item.price || 0) * Number(item.quantity || 1))}</strong>

              {metaLoading ? (
                <span className="checkout-stock is-loading">Checking stock…</span>
              ) : (
                <StockBadge meta={meta} />
              )}

              <div className="checkout-qty-row">
                <div className="checkout-qty" aria-label={`Quantity for ${item.title}`}>
                  <button
                    type="button"
                    onClick={() => onDecrease(item)}
                    disabled={item.quantity <= 1}
                    aria-label={`Decrease quantity of ${item.title}`}
                  >
                    <i className="bi bi-dash" aria-hidden="true" />
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onIncrease(item)}
                    disabled={maxReached}
                    title={maxReached ? `Only ${meta.stock} available` : undefined}
                    aria-label={`Increase quantity of ${item.title}`}
                  >
                    <i className="bi bi-plus" aria-hidden="true" />
                  </button>
                </div>

                <button
                  type="button"
                  className="checkout-remove-item"
                  onClick={() => onRemoveItem(item)}
                  aria-label={`Remove ${item.title}`}
                >
                  <i className="bi bi-trash3" aria-hidden="true" />
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>

    <dl className="checkout-summary-breakdown">
      <div>
        <dt>Subtotal</dt>
        <dd>{money.format(subtotal)}</dd>
      </div>

      {discount > 0 && (
        <div>
          <dt>Discount</dt>
          <dd className="checkout-discount">-{money.format(discount)}</dd>
        </div>
      )}

      <div>
        <dt>Shipping</dt>
        <dd className="checkout-free">{shipping === 0 ? 'FREE' : money.format(shipping)}</dd>
      </div>

      <div>
        <dt>Tax (Est.)</dt>
        <dd>{money.format(tax)}</dd>
      </div>

      {walletApplied > 0 && (
        <div>
          <dt>Store credit</dt>
          <dd className="checkout-discount">-{money.format(walletApplied)}</dd>
        </div>
      )}
    </dl>

    <div className="checkout-summary-total">
      <span>Total</span>
      <strong>{money.format(total)}</strong>
    </div>

    {walletBalance > 0 && (
      <label className="checkout-wallet">
        <input
          type="checkbox"
          checked={useWalletCredit}
          onChange={(event) => onToggleWallet(event.target.checked)}
        />
        <span className="checkout-wallet-box" aria-hidden="true">
          <i className="bi bi-check2" />
        </span>
        <span className="checkout-wallet-text">
          <strong>Use store credit</strong>
          <small>{money.format(walletBalance)} available</small>
        </span>
      </label>
    )}

    <form
      className="checkout-promo"
      onSubmit={(event) => {
        event.preventDefault();
        onApplyPromo();
      }}
    >
      <input
        type="text"
        value={promoInput}
        onChange={(event) => onPromoInputChange(event.target.value)}
        placeholder="Promo Code"
        aria-label="Promo code"
      />
      <button type="submit">Apply</button>
    </form>

    {appliedPromo && (
      <p className="checkout-promo-applied">
        <span>
          <i className="bi bi-tag-fill" aria-hidden="true" />
          {appliedPromo.code} — {appliedPromo.label}
        </span>
        <button type="button" onClick={onRemovePromo} aria-label="Remove promo code">
          <i className="bi bi-x-lg" aria-hidden="true" />
        </button>
      </p>
    )}

    <div className="checkout-trust">
      <p>
        <i className="bi bi-shield-check" aria-hidden="true" />
        256-bit SSL Secure Payment
      </p>
      <p>
        <i className="bi bi-truck" aria-hidden="true" />
        {shippingInfo || 'Free express delivery'}
      </p>
      <p>
        <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
        {returnPolicy || '30-Day Money Back Guarantee'}
      </p>
    </div>
  </aside>
);

/* ----------------------------------------------------------------
   Checkout page
   ---------------------------------------------------------------- */
const CheckoutPage = () => {
  const { cartItems, updateQuantity, removeFromCart, clearCart } = useCart();
  const { user } = useContext(AuthContext);
  const { balance: walletBalance, spendFunds, refreshOrders } = useWallet();
  const { notify } = useNotification();
  const navigate = useNavigate();

  const shippingRef = useRef(null);
  const paymentRef = useRef(null);
  const reviewRef = useRef(null);
  const prefilledRef = useRef(false);

  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [useWalletCredit, setUseWalletCredit] = useState(false);

  /* --- live data pulled from DummyJSON --- */
  const [isPrefilling, setIsPrefilling] = useState(true);
  const [prefilled, setPrefilled] = useState(false);
  const [productMeta, setProductMeta] = useState({});
  const [metaLoading, setMetaLoading] = useState(true);

  const [shipping, setShipping] = useState({
    firstName: '',
    lastName: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    phone: '',
  });

  const [billing, setBilling] = useState({
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
  });

  const [card, setCard] = useState({
    name: '',
    number: '',
    expiry: '',
    cvc: '',
  });

  /* -------------------------------------------------------------
     ProtectedRoute already guarantees a signed-in user on this route,
     so the only thing left to guard against is an empty cart.
     ------------------------------------------------------------- */
  useEffect(() => {
    if (cartItems.length === 0 && !orderPlaced) {
      navigate('/cart', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems.length, orderPlaced]);

  /* -------------------------------------------------------------
     1) GET /auth/me — prefill the whole shipping form.
        /auth/login only returns 9 fields with no address, while
        /auth/me returns the full profile including address+phone.
     ------------------------------------------------------------- */
  useEffect(() => {
    if (!user || prefilledRef.current) return;

    let cancelled = false;
    prefilledRef.current = true;

    const loadProfile = async () => {
      setIsPrefilling(true);

      /* Fallback to whatever the login response already gave us. */
      const applyBasics = () =>
        setShipping((prev) => ({
          ...prev,
          firstName: prev.firstName || user.firstName || '',
          lastName: prev.lastName || user.lastName || '',
          email: prev.email || user.email || '',
        }));

      const token = user.accessToken || user.token;

      if (!token) {
        applyBasics();
        setIsPrefilling(false);
        return;
      }

      try {
        const { data: me } = await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        const addr = me.address || {};

        setShipping((prev) => ({
          ...prev,
          firstName: me.firstName || prev.firstName,
          lastName: me.lastName || prev.lastName,
          email: me.email || prev.email,
          phone: me.phone || prev.phone,
          address: addr.address || prev.address,
          city: addr.city || prev.city,
          state: addr.state || prev.state,
          zipCode: addr.postalCode || prev.zipCode,
          country: COUNTRIES.includes(addr.country) ? addr.country : prev.country,
        }));

        setCard((prev) => ({
          ...prev,
          name: prev.name || `${me.firstName || ''} ${me.lastName || ''}`.trim(),
        }));

        setPrefilled(true);
        notify.info('We filled your saved address — review it before placing the order.');
      } catch (error) {
        console.error('Failed to load the account profile:', error);
        if (!cancelled) applyBasics();
      } finally {
        if (!cancelled) setIsPrefilling(false);
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* -------------------------------------------------------------
     2) GET /products/{id} — live stock, shipping and return policy.
     ------------------------------------------------------------- */
  useEffect(() => {
    if (cartItems.length === 0) {
      setMetaLoading(false);
      return undefined;
    }

    let cancelled = false;
    const ids = cartItems.map((item) => item.id);

    const loadMeta = async () => {
      setMetaLoading(true);

      try {
        const responses = await Promise.allSettled(
          ids.map((id) => axios.get(`${API}/products/${id}`))
        );

        if (cancelled) return;

        const next = {};

        responses.forEach((response, index) => {
          if (response.status !== 'fulfilled') return;

          const product = response.value.data;

          next[ids[index]] = {
            stock: Number(product.stock ?? 999),
            availabilityStatus: product.availabilityStatus || 'In Stock',
            shippingInformation: product.shippingInformation || '',
            returnPolicy: product.returnPolicy || '',
            minimumOrderQuantity: Number(product.minimumOrderQuantity ?? 1),
          };
        });

        setProductMeta(next);

        /* Clamp anything already over the live stock level. */
        cartItems.forEach((item) => {
          const meta = next[item.id];
          if (!meta) return;

          if (meta.stock > 0 && item.quantity > meta.stock) {
            updateQuantity(item.id, meta.stock);
            notify.warning(
              `${item.title} is limited to ${meta.stock} in stock — quantity was adjusted.`
            );
          }
        });
      } catch (error) {
        console.error('Failed to load product availability:', error);
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    };

    loadMeta();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems.length]);

  /* ------------------------------- totals ------------------------------- */
  const subtotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
        0
      ),
    [cartItems]
  );

  const discount = useMemo(() => {
    if (!appliedPromo) return 0;
    if (appliedPromo.type === 'percent') return subtotal * appliedPromo.value;
    return Math.min(appliedPromo.value, subtotal);
  }, [appliedPromo, subtotal]);

  const shippingCost = 0;
  const tax = Math.max(subtotal - discount, 0) * 0.08;
  const grossTotal = Math.max(subtotal - discount, 0) + shippingCost + tax;

  /* Store credit can only ever cover what is actually owed. */
  const walletApplied = useWalletCredit ? Math.min(walletBalance, grossTotal) : 0;
  const total = Math.max(0, grossTotal - walletApplied);

  /* The slowest shipping promise across the cart wins. */
  const shippingInfo = useMemo(() => {
    const values = Object.values(productMeta)
      .map((meta) => meta.shippingInformation)
      .filter(Boolean);

    if (values.length === 0) return '';

    const rank = (text) => {
      const match = text.match(/(\d+)/);
      const amount = match ? Number(match[1]) : 0;
      return /month/i.test(text) ? amount * 30 : /week/i.test(text) ? amount * 7 : amount;
    };

    return values.reduce((slowest, current) => (rank(current) > rank(slowest) ? current : slowest));
  }, [productMeta]);

  const returnPolicy = useMemo(() => {
    const values = Object.values(productMeta)
      .map((meta) => meta.returnPolicy)
      .filter(Boolean);

    if (values.length === 0) return '';

    return values.reduce((shortest, current) => {
      const days = (text) => Number(text.match(/(\d+)/)?.[1] ?? 0);
      return days(current) < days(shortest) ? current : shortest;
    });
  }, [productMeta]);

  const outOfStockItems = cartItems.filter((item) => productMeta[item.id]?.stock === 0);

  /* ------------------------------ handlers ------------------------------ */
  /* Development helper. Vite strips this branch from a production build,
     so the button never ships to real shoppers. */
  const fillTestData = () => {
    setShipping((prev) => ({
      firstName: prev.firstName || 'Emily',
      lastName: prev.lastName || 'Johnson',
      email: prev.email || 'emily.johnson@x.dummyjson.com',
      address: prev.address || '626 Main Street',
      city: prev.city || 'Phoenix',
      state: prev.state || 'Mississippi',
      zipCode: prev.zipCode || '29112',
      country: prev.country || 'United States',
      phone: prev.phone || '+20 100 000 0000',
    }));

    setCard({
      name: 'Emily Johnson',
      number: '4242 4242 4242 4242',
      expiry: '12/29',
      cvc: '123',
    });

    setSameAsShipping(true);
    notify.info('Test data filled — you can place the order now.');
  };

  const handleShippingChange = (event) => {
    const { name, value } = event.target;
    setShipping((prev) => ({ ...prev, [name]: value }));
  };

  const handleBillingChange = (event) => {
    const { name, value } = event.target;
    setBilling((prev) => ({ ...prev, [name]: value }));
  };

  const handleCardChange = (event) => {
    const { name, value } = event.target;

    if (name === 'number') {
      const digits = value.replace(/\D/g, '').slice(0, 16);
      setCard((prev) => ({ ...prev, number: digits.replace(/(.{4})/g, '$1 ').trim() }));
      return;
    }

    if (name === 'expiry') {
      const digits = value.replace(/\D/g, '').slice(0, 4);
      setCard((prev) => ({
        ...prev,
        expiry: digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits,
      }));
      return;
    }

    if (name === 'cvc') {
      setCard((prev) => ({ ...prev, cvc: value.replace(/\D/g, '').slice(0, 4) }));
      return;
    }

    setCard((prev) => ({ ...prev, [name]: value }));
  };

  /* --------------------------- cart quantities -------------------------- */
  const increaseQuantity = (item) => {
    const meta = productMeta[item.id];

    if (meta && item.quantity >= meta.stock) {
      notify.warning(`Only ${meta.stock} unit(s) of ${item.title} are available right now.`);
      return;
    }

    updateQuantity(item.id, item.quantity + 1);
  };

  const decreaseQuantity = (item) => {
    if (item.quantity <= 1) return;
    updateQuantity(item.id, item.quantity - 1);
  };

  const removeItem = (item) => {
    removeFromCart(item.id);
    notify.info(`${item.title} was removed from your order.`);
  };

  /* ------------------------------- promo -------------------------------- */
  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();

    if (!code) {
      notify.warning('Please enter a promo code first.');
      return;
    }

    if (appliedPromo?.code === code) {
      notify.info('This promo code is already applied.');
      return;
    }

    const promo = PROMO_CODES[code];

    if (!promo) {
      notify.error('Invalid promo code', `"${code}" is not a valid or active code.`);
      return;
    }

    setAppliedPromo({ code, ...promo });
    setPromoInput('');
    notify.success(`Promo code applied — ${promo.label}.`);
  };

  const removePromo = () => {
    setAppliedPromo(null);
    notify.info('Promo code removed.');
  };

  /* ------------------------------- steps -------------------------------- */
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shipping.email);

  const shippingIsComplete = Boolean(
    shipping.firstName &&
    shipping.lastName &&
    emailIsValid &&
    shipping.address &&
    shipping.city &&
    shipping.state &&
    shipping.zipCode &&
    shipping.country
  );

  const billingIsComplete =
    sameAsShipping ||
    Boolean(billing.address && billing.city && billing.state && billing.zipCode && billing.country);

  const paymentIsComplete =
    billingIsComplete &&
    (paymentMethod === 'paypal' || Boolean(card.name && card.number && card.expiry && card.cvc));

  const currentStep = !shippingIsComplete ? 1 : !paymentIsComplete ? 2 : 3;

  const scrollToStep = (stepId) => {
    const target =
      stepId === 1 ? shippingRef.current : stepId === 2 ? paymentRef.current : reviewRef.current;

    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ----------------------------- place order ---------------------------- */
  const handlePlaceOrder = async (event) => {
    event.preventDefault();

    if (outOfStockItems.length > 0) {
      notify.error(
        'Item out of stock',
        `${outOfStockItems[0].title} is no longer available. Please remove it to continue.`
      );
      return;
    }

    if (!shippingIsComplete) {
      notify.error(
        'Missing shipping details',
        emailIsValid
          ? 'Please complete all required shipping fields.'
          : 'Please enter a valid email address for your order confirmation.'
      );
      scrollToStep(1);
      return;
    }

    if (!billingIsComplete) {
      notify.error('Missing billing address', 'Please complete your billing address details.');
      scrollToStep(2);
      return;
    }

    if (paymentMethod === 'card') {
      if (!card.name.trim()) {
        notify.error('Missing cardholder name', 'Please enter the name printed on your card.');
        scrollToStep(2);
        return;
      }

      if (card.number.replace(/\s/g, '').length < 16) {
        notify.error('Invalid card number', 'Please enter a valid 16-digit card number.');
        scrollToStep(2);
        return;
      }

      if (!/^\d{2}\/\d{2}$/.test(card.expiry)) {
        notify.error('Invalid expiry date', 'Please use the MM/YY format.');
        scrollToStep(2);
        return;
      }

      const [month] = card.expiry.split('/').map(Number);
      if (month < 1 || month > 12) {
        notify.error('Invalid expiry month', 'The month must be between 01 and 12.');
        scrollToStep(2);
        return;
      }

      if (card.cvc.length < 3) {
        notify.error('Invalid CVC', 'Please enter the 3 or 4 digit code on your card.');
        scrollToStep(2);
        return;
      }
    }

    setIsPlacingOrder(true);

    /* ----------------------------------------------------------
       3) POST /carts/add — register the order on DummyJSON and
          use the returned id as the real order number.
       ---------------------------------------------------------- */
    let serverCart = null;

    try {
      const { data } = await axios.post(`${API}/carts/add`, {
        userId: user?.id ?? 1,
        products: cartItems.map((item) => ({ id: item.id, quantity: item.quantity })),
      });

      serverCart = data;
    } catch (error) {
      console.error('Failed to submit the order:', error);
      notify.error(
        'We could not place your order',
        error.response?.data?.message || 'Please check your connection and try again.'
      );
      setIsPlacingOrder(false);
      return;
    }

    const order = {
      orderNumber: serverCart?.id ? `SS-${String(serverCart.id).padStart(5, '0')}` : `SS-${Date.now().toString().slice(-8)}`,
      serverCartId: serverCart?.id ?? null,
      placedAt: new Date().toISOString(),
      items: cartItems.map((item) => ({
        id: item.id,
        title: item.title,
        price: Number(item.price || 0),
        quantity: item.quantity,
        thumbnail: item.thumbnail || item.images?.[0] || '',
        selectedColor: item.selectedColor || null,
      })),
      shipping,
      billing: sameAsShipping
        ? {
          address: shipping.address,
          city: shipping.city,
          state: shipping.state,
          zipCode: shipping.zipCode,
          country: shipping.country,
        }
        : billing,
      payment:
        paymentMethod === 'paypal'
          ? { method: 'paypal' }
          : { method: 'card', last4: card.number.replace(/\s/g, '').slice(-4) },
      promo: appliedPromo ? { code: appliedPromo.code, label: appliedPromo.label } : null,
      shippingInformation: shippingInfo,
      returnPolicy,
      totals: { subtotal, discount, shipping: shippingCost, tax, walletApplied, total },
      serverTotals: serverCart
        ? { total: serverCart.total, discountedTotal: serverCart.discountedTotal }
        : null,
    };

    try {
      /* The confirmation page reads this one. */
      sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));

      /* And this one feeds the "View Order History" list. */
      const history = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || '[]');
      const nextHistory = [order, ...(Array.isArray(history) ? history : [])].slice(0, 20);
      localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(nextHistory));
    } catch (error) {
      console.error('Failed to store the placed order:', error);
    }

    if (walletApplied > 0) {
      spendFunds(walletApplied, `Order ${order.orderNumber}`);
    }

    setOrderPlaced(true);
    clearCart();
    refreshOrders();
    setIsPlacingOrder(false);

    notify.success(`Order ${order.orderNumber} placed successfully. Thank you, ${shipping.firstName}!`);
    navigate('/order-confirmation', { replace: true });
  };

  if (cartItems.length === 0 && !orderPlaced) return null;

  const billingSource = sameAsShipping ? shipping : billing;

  return (
    <main className="checkout-page">
      <div className="checkout-shell">
        <header className="checkout-header">
          <div>
            <h1>Secure Checkout</h1>
            <p>Complete your order with ShopStream&apos;s verified protection.</p>
          </div>

          <Link to="/cart" className="checkout-back-link">
            <i className="bi bi-arrow-left-short" aria-hidden="true" />
            Back to cart
          </Link>
        </header>

        <CheckoutStepper currentStep={currentStep} onStepClick={scrollToStep} />

        {import.meta.env.DEV && (
          <button type="button" className="checkout-devfill" onClick={fillTestData}>
            <i className="bi bi-magic" aria-hidden="true" />
            Fill test data
            <span>dev only</span>
          </button>
        )}

        {outOfStockItems.length > 0 && (
          <div className="checkout-alert is-error" role="alert">
            <i className="bi bi-x-octagon-fill" aria-hidden="true" />
            <span>
              <strong>{outOfStockItems[0].title}</strong> is out of stock. Remove it from your order
              to continue.
            </span>
          </div>
        )}

        <div className="checkout-layout">
          <form className="checkout-main" onSubmit={handlePlaceOrder} noValidate>
            {/* ------------------------- shipping ------------------------- */}
            <section className="checkout-card" ref={shippingRef} aria-labelledby="shipping-heading">
              <h2 id="shipping-heading">
                <i className="bi bi-truck" aria-hidden="true" />
                Shipping Information
                {isPrefilling && <span className="checkout-inline-loader">Loading your details…</span>}
              </h2>

              {prefilled && !isPrefilling && (
                <div className="checkout-alert is-info">
                  <i className="bi bi-person-check-fill" aria-hidden="true" />
                  <span>We filled this in from your ShopStream account. Edit anything you need.</span>
                </div>
              )}

              <div className="checkout-field-row">
                <div className="checkout-field">
                  <label htmlFor="firstName">First Name</label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    placeholder="John"
                    value={shipping.firstName}
                    onChange={handleShippingChange}
                    autoComplete="given-name"
                  />
                </div>

                <div className="checkout-field">
                  <label htmlFor="lastName">Last Name</label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    placeholder="Doe"
                    value={shipping.lastName}
                    onChange={handleShippingChange}
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="checkout-field">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="john@example.com"
                  value={shipping.email}
                  onChange={handleShippingChange}
                  autoComplete="email"
                />
                <span className="checkout-field-hint">
                  <i className="bi bi-envelope-check" aria-hidden="true" />
                  Your order confirmation and tracking link will be sent here.
                </span>
              </div>

              <div className="checkout-field">
                <label htmlFor="address">Address</label>
                <input
                  id="address"
                  name="address"
                  type="text"
                  placeholder="123 Commerce Way"
                  value={shipping.address}
                  onChange={handleShippingChange}
                  autoComplete="street-address"
                />
              </div>

              <div className="checkout-field-row">
                <div className="checkout-field">
                  <label htmlFor="country">Country</label>
                  <div className="checkout-select-wrap">
                    <select
                      id="country"
                      name="country"
                      value={shipping.country}
                      onChange={handleShippingChange}
                      autoComplete="country-name"
                    >
                      {COUNTRIES.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                    <i className="bi bi-chevron-down" aria-hidden="true" />
                  </div>
                </div>

                <div className="checkout-field">
                  <label htmlFor="state">State / Governorate</label>
                  <input
                    id="state"
                    name="state"
                    type="text"
                    placeholder="New York"
                    value={shipping.state}
                    onChange={handleShippingChange}
                    autoComplete="address-level1"
                  />
                </div>
              </div>

              <div className="checkout-field-row checkout-field-row--three">
                <div className="checkout-field">
                  <label htmlFor="city">City</label>
                  <input
                    id="city"
                    name="city"
                    type="text"
                    placeholder="New York"
                    value={shipping.city}
                    onChange={handleShippingChange}
                    autoComplete="address-level2"
                  />
                </div>

                <div className="checkout-field">
                  <label htmlFor="zipCode">Zip Code</label>
                  <input
                    id="zipCode"
                    name="zipCode"
                    type="text"
                    placeholder="10001"
                    value={shipping.zipCode}
                    onChange={handleShippingChange}
                    autoComplete="postal-code"
                  />
                </div>

                <div className="checkout-field">
                  <label htmlFor="phone">Phone Number</label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={shipping.phone}
                    onChange={handleShippingChange}
                    autoComplete="tel"
                  />
                </div>
              </div>
            </section>

            {/* -------------------------- payment ------------------------- */}
            <section className="checkout-card" ref={paymentRef} aria-labelledby="payment-heading">
              <h2 id="payment-heading">
                <i className="bi bi-credit-card-2-front" aria-hidden="true" />
                Payment Method
              </h2>

              <div className={`checkout-method ${paymentMethod === 'card' ? 'is-selected' : ''}`}>
                <label className="checkout-method-head">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="card"
                    checked={paymentMethod === 'card'}
                    onChange={() => setPaymentMethod('card')}
                  />
                  <span className="checkout-radio" aria-hidden="true" />
                  <span className="checkout-method-title">Credit or Debit Card</span>
                  <i className="bi bi-credit-card checkout-method-icon" aria-hidden="true" />
                </label>

                {paymentMethod === 'card' && (
                  <div className="checkout-method-body">
                    <div className="checkout-field">
                      <label htmlFor="cardName">Cardholder Name</label>
                      <input
                        id="cardName"
                        name="name"
                        type="text"
                        placeholder="John Doe"
                        value={card.name}
                        onChange={handleCardChange}
                        autoComplete="cc-name"
                      />
                    </div>

                    <div className="checkout-field">
                      <label htmlFor="cardNumber">Card Number</label>
                      <input
                        id="cardNumber"
                        name="number"
                        type="text"
                        inputMode="numeric"
                        placeholder="0000 0000 0000 0000"
                        value={card.number}
                        onChange={handleCardChange}
                        autoComplete="cc-number"
                      />
                    </div>

                    <div className="checkout-field-row">
                      <div className="checkout-field">
                        <label htmlFor="expiry">Expiry Date</label>
                        <input
                          id="expiry"
                          name="expiry"
                          type="text"
                          inputMode="numeric"
                          placeholder="MM/YY"
                          value={card.expiry}
                          onChange={handleCardChange}
                          autoComplete="cc-exp"
                        />
                      </div>

                      <div className="checkout-field">
                        <label htmlFor="cvc">CVC</label>
                        <input
                          id="cvc"
                          name="cvc"
                          type="text"
                          inputMode="numeric"
                          placeholder="123"
                          value={card.cvc}
                          onChange={handleCardChange}
                          autoComplete="cc-csc"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className={`checkout-method ${paymentMethod === 'paypal' ? 'is-selected' : ''}`}>
                <label className="checkout-method-head">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="paypal"
                    checked={paymentMethod === 'paypal'}
                    onChange={() => setPaymentMethod('paypal')}
                  />
                  <span className="checkout-radio" aria-hidden="true" />
                  <span className="checkout-method-title">PayPal</span>
                  <i className="bi bi-paypal checkout-method-icon" aria-hidden="true" />
                </label>

                {paymentMethod === 'paypal' && (
                  <div className="checkout-method-body">
                    <p className="checkout-paypal-note">
                      You will be redirected to PayPal to authorise this payment securely.
                    </p>
                  </div>
                )}
              </div>

              {/* ------------------- billing address ------------------- */}
              <div className="checkout-billing">
                <label className="checkout-check">
                  <input
                    type="checkbox"
                    checked={sameAsShipping}
                    onChange={(event) => setSameAsShipping(event.target.checked)}
                  />
                  <span className="checkout-checkbox" aria-hidden="true">
                    <i className="bi bi-check2" />
                  </span>
                  <span>Billing address is the same as shipping address</span>
                </label>

                {!sameAsShipping && (
                  <div className="checkout-billing-fields">
                    <div className="checkout-field">
                      <label htmlFor="billingAddress">Billing Address</label>
                      <input
                        id="billingAddress"
                        name="address"
                        type="text"
                        placeholder="123 Commerce Way"
                        value={billing.address}
                        onChange={handleBillingChange}
                      />
                    </div>

                    <div className="checkout-field-row">
                      <div className="checkout-field">
                        <label htmlFor="billingCountry">Country</label>
                        <div className="checkout-select-wrap">
                          <select
                            id="billingCountry"
                            name="country"
                            value={billing.country}
                            onChange={handleBillingChange}
                          >
                            {COUNTRIES.map((country) => (
                              <option key={country} value={country}>
                                {country}
                              </option>
                            ))}
                          </select>
                          <i className="bi bi-chevron-down" aria-hidden="true" />
                        </div>
                      </div>

                      <div className="checkout-field">
                        <label htmlFor="billingState">State / Governorate</label>
                        <input
                          id="billingState"
                          name="state"
                          type="text"
                          placeholder="New York"
                          value={billing.state}
                          onChange={handleBillingChange}
                        />
                      </div>
                    </div>

                    <div className="checkout-field-row">
                      <div className="checkout-field">
                        <label htmlFor="billingCity">City</label>
                        <input
                          id="billingCity"
                          name="city"
                          type="text"
                          placeholder="New York"
                          value={billing.city}
                          onChange={handleBillingChange}
                        />
                      </div>

                      <div className="checkout-field">
                        <label htmlFor="billingZip">Zip Code</label>
                        <input
                          id="billingZip"
                          name="zipCode"
                          type="text"
                          placeholder="10001"
                          value={billing.zipCode}
                          onChange={handleBillingChange}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* --------------------------- review ------------------------- */}
            <section className="checkout-card" ref={reviewRef} aria-labelledby="review-heading">
              <h2 id="review-heading">
                <i className="bi bi-clipboard-check" aria-hidden="true" />
                Review &amp; Confirm
              </h2>

              <div className="checkout-review-grid">
                <div className="checkout-review-block">
                  <div className="checkout-review-block-head">
                    <h3>Ship to</h3>
                    <button type="button" onClick={() => scrollToStep(1)}>
                      Edit
                    </button>
                  </div>

                  {shippingIsComplete ? (
                    <address>
                      {shipping.firstName} {shipping.lastName}
                      <br />
                      {shipping.address}
                      <br />
                      {shipping.city}, {shipping.state} {shipping.zipCode}
                      <br />
                      {shipping.country}
                      <br />
                      <span>{shipping.email}</span>
                      {shipping.phone && (
                        <>
                          <br />
                          <span>{shipping.phone}</span>
                        </>
                      )}
                    </address>
                  ) : (
                    <p className="checkout-review-pending">
                      <i className="bi bi-exclamation-circle" aria-hidden="true" />
                      Complete your shipping information above.
                    </p>
                  )}
                </div>

                <div className="checkout-review-block">
                  <div className="checkout-review-block-head">
                    <h3>Payment</h3>
                    <button type="button" onClick={() => scrollToStep(2)}>
                      Edit
                    </button>
                  </div>

                  {paymentIsComplete ? (
                    <address>
                      {paymentMethod === 'paypal'
                        ? 'PayPal account'
                        : `Card ending in ${card.number.replace(/\s/g, '').slice(-4)}`}
                      <br />
                      <span>
                        Billed to {billingSource.address}, {billingSource.city},{' '}
                        {billingSource.state} {billingSource.zipCode}, {billingSource.country}
                      </span>
                    </address>
                  ) : (
                    <p className="checkout-review-pending">
                      <i className="bi bi-exclamation-circle" aria-hidden="true" />
                      Complete your payment details above.
                    </p>
                  )}
                </div>
              </div>

              {shippingInfo && (
                <p className="checkout-review-shipping">
                  <i className="bi bi-box-seam" aria-hidden="true" />
                  Estimated dispatch: <strong>{shippingInfo}</strong>
                </p>
              )}

              <div className="checkout-review-total">
                <span>
                  {cartItems.reduce((count, item) => count + item.quantity, 0)} item(s) — total due
                </span>
                <strong>{money.format(total)}</strong>
              </div>
            </section>

            <div className="checkout-actions">
              <button
                type="submit"
                className="checkout-place-order"
                disabled={isPlacingOrder || outOfStockItems.length > 0}
              >
                {isPlacingOrder ? (
                  <>
                    <span className="checkout-spinner" aria-hidden="true" />
                    Processing…
                  </>
                ) : (
                  <>
                    Place Order
                    <i className="bi bi-arrow-right" aria-hidden="true" />
                  </>
                )}
              </button>

              <p className="checkout-terms-note">
                By placing this order you agree to ShopStream&apos;s Terms of Service and Privacy
                Policy.
              </p>
            </div>
          </form>

          <OrderSummary
            cartItems={cartItems}
            productMeta={productMeta}
            metaLoading={metaLoading}
            subtotal={subtotal}
            shipping={shippingCost}
            tax={tax}
            discount={discount}
            total={total}
            promoInput={promoInput}
            onPromoInputChange={setPromoInput}
            onApplyPromo={applyPromo}
            onRemovePromo={removePromo}
            appliedPromo={appliedPromo}
            onIncrease={increaseQuantity}
            onDecrease={decreaseQuantity}
            onRemoveItem={removeItem}
            shippingInfo={shippingInfo}
            returnPolicy={returnPolicy}
            walletBalance={walletBalance}
            walletApplied={walletApplied}
            useWalletCredit={useWalletCredit}
            onToggleWallet={setUseWalletCredit}
          />
        </div>
      </div>
    </main>
  );
};

export default CheckoutPage;
