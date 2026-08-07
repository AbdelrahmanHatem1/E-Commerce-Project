import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthContext } from './AuthContext.jsx';
import { useNotification } from '../components/Notification.jsx';

const CartContext = createContext();

/* Every user gets his own cart bucket inside localStorage. */
const CART_KEY_PREFIX = 'shopstream_cart_';
const getCartKey = (user) => {
  if (!user) return null;
  return `${CART_KEY_PREFIX}${user.id ?? user.username ?? 'guest'}`;
};

const readCart = (key) => {
  if (!key) return [];
  try {
    const saved = localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read the saved cart:', error);
    return [];
  }
};

export const CartProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const { notify } = useNotification();

  const [cartItems, setCartItems] = useState([]);
  /* activeKey = the storage key the current cartItems belong to. */
  const [activeKey, setActiveKey] = useState(null);

  /* 1) Load the cart whenever the logged-in user changes (or on refresh). */
  useEffect(() => {
    const key = getCartKey(user);
    setCartItems(readCart(key));
    setActiveKey(key);
  }, [user]);

  /* 2) Save the cart on every change (only for a logged-in user). */
  useEffect(() => {
    if (!activeKey) return;
    if (activeKey !== getCartKey(user)) return; // still switching users
    try {
      localStorage.setItem(activeKey, JSON.stringify(cartItems));
    } catch (error) {
      console.error('Failed to save the cart:', error);
    }
  }, [cartItems, activeKey, user]);

  const addToCart = (product) => {
    /* Guard: no login -> no cart. */
    if (!user) {
      notify.warning('Please sign in or create an account first to add items to your cart.');
      return false;
    }

    if (!product || product.id === undefined) return false;

    let alreadyInCart = false;

    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.id === product.id);

      if (existingItem) {
        alreadyInCart = true;
        return prevItems.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...prevItems, { ...product, quantity: 1 }];
    });

    notify.success(
      alreadyInCart
        ? `${product.title} quantity updated in your cart.`
        : `${product.title} was added to your cart.`
    );

    return true;
  };

  const removeFromCart = (productId) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    const nextQuantity = Number(quantity);

    if (!Number.isFinite(nextQuantity) || nextQuantity < 1) {
      removeFromCart(productId);
      return;
    }

    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item.id === productId ? { ...item, quantity: nextQuantity } : item
      )
    );
  };

  const clearCart = () => setCartItems([]);

  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);

  const cartTotal = cartItems.reduce(
    (total, item) => total + Number(item.price || 0) * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        cartTotal,
        isLoggedIn: Boolean(user),
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);

export default CartContext;
