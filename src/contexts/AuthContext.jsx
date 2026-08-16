import React, { createContext, useEffect, useState } from 'react';
import axios from 'axios';
import { useNotification } from '../components/Notification.jsx';
import { KEYS, readJson, writeJson } from '../lib/storage.js';

export const AuthContext = createContext();

/* ------------------------------------------------------------------
   Locally created accounts.

   DummyJSON's /users/add answers with a fresh id and the full record,
   but stores nothing: search for the username a second later and it is
   gone. Verified against the live API. So an account created through
   Register could never be used to sign in — the visitor filled in the
   form, was sent to the login page, and was told "Invalid credentials"
   with their own brand-new details.

   These accounts therefore live on the device. The demo accounts that
   ship with DummyJSON still authenticate normally against the API;
   this layer is only consulted first, and only ever adds accounts.
   ------------------------------------------------------------------ */
const readAccounts = () => readJson(KEYS.localAccounts, []);

const saveAccount = (account) => {
  const rest = readAccounts().filter(
    (a) => a.username.toLowerCase() !== account.username.toLowerCase()
  );
  writeJson(KEYS.localAccounts, [...rest, account]);
};

/* Matches on username or email, both case-insensitively — a visitor who
   registered as "Sara" should not be turned away for typing "sara". */
const findAccount = (identifier) => {
  const needle = String(identifier || '').trim().toLowerCase();
  if (!needle) return null;

  return (
    readAccounts().find(
      (a) =>
        a.username.toLowerCase() === needle ||
        (a.email || '').toLowerCase() === needle
    ) || null
  );
};

/* The session object, without the password. Shaped like the API's own
   login response so every consumer downstream is unaffected. */
const toSession = (account) => {
  const { password, ...safe } = account;
  return { ...safe, accessToken: `local.${account.id}`, isLocalAccount: true };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const { notify } = useNotification();

  /* Restore the session on refresh: localStorage (Remember me) then sessionStorage. */
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (error) {
      console.error('Failed to restore the saved session:', error);
      localStorage.removeItem('user');
      sessionStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  }, []);

  /* One writer for the session, so the two login paths can never drift
     on which storage they use. */
  const persistSession = (session, rememberMe) => {
    setUser(session);

    if (rememberMe) {
      sessionStorage.removeItem('user');
      localStorage.setItem('user', JSON.stringify(session));
    } else {
      localStorage.removeItem('user');
      sessionStorage.setItem('user', JSON.stringify(session));
    }
  };

  const login = async (usernameOrEmail, password, rememberMe = false) => {
    setIsLoggingIn(true);

    try {
      if (!usernameOrEmail || !password) {
        notify.error('Login Error', 'Please fill in all fields.');
        return { success: false, message: 'Please fill in all fields.' };
      }

      /* A locally created account is checked first. It cannot exist on
         the API by definition, so asking the server would only produce
         a misleading "Invalid credentials" for a real account. */
      const local = findAccount(usernameOrEmail);

      if (local) {
        if (local.password !== password) {
          notify.error('Login Failed', 'Invalid username or password.');
          return { success: false, message: 'Invalid username or password.' };
        }

        const session = toSession(local);
        persistSession(session, rememberMe);
        notify.success(`Welcome back, ${session.firstName || session.username}!`);
        return { success: true, user: session };
      }

      const response = await axios.post('https://dummyjson.com/auth/login', {
        username: usernameOrEmail,
        password,
      });

      const userData = response.data;
      setUser(userData);

      persistSession(userData, rememberMe);

      notify.success(`Welcome back, ${userData.firstName}!`);
      return { success: true, user: userData };
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Invalid username or password.';
      notify.error('Login Failed', errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setIsLoggingIn(false);
    }
  };

  const register = async (formData, { signIn = true, rememberMe = false } = {}) => {
    setIsRegistering(true);

    try {
      const [firstName, ...rest] = (formData.fullName || '').trim().split(' ');

      /* Reject a duplicate before calling out. The API happily accepts
         one, since it never stores anything to collide with. */
      if (findAccount(formData.username) || findAccount(formData.email)) {
        const message = 'That username or email is already registered on this device.';
        return { success: false, message };
      }

      /* Still posted so the network path stays exercised and any real
         validation error surfaces — but the response is not what makes
         the account usable. */
      let remote = null;
      try {
        const response = await axios.post('https://dummyjson.com/users/add', {
          firstName: firstName || formData.username,
          lastName: rest.join(' '),
          username: formData.username,
          email: formData.email,
          password: formData.password,
        });
        remote = response.data;
      } catch (error) {
        /* A rejection from the API is worth reporting; being offline is
           not, because the account works either way. */
        const apiMessage = error.response?.data?.message;
        if (apiMessage) {
          return { success: false, message: apiMessage };
        }
        console.warn('Register: the demo API is unreachable, continuing locally.');
      }

      const account = {
        /* Keep the id the API minted when there is one, so the record
           looks like every other user in the app. */
        id: remote?.id ?? Date.now(),
        firstName: firstName || formData.username,
        lastName: rest.join(' '),
        username: formData.username,
        email: formData.email,
        password: formData.password,
        image: remote?.image || '',
        role: 'user',
        createdAt: new Date().toISOString(),
      };

      saveAccount(account);

      const session = toSession(account);
      if (signIn) persistSession(session, rememberMe);

      return { success: true, user: session };
    } catch (error) {
      console.error('Register error:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Registration failed. Please try again.';
      return { success: false, message: errorMessage };
    } finally {
      setIsRegistering(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    sessionStorage.removeItem('user');

    /* The confirmation page reads the last order from sessionStorage.
       Leaving it behind would show one user's order to the next one. */
    sessionStorage.removeItem('shopstream_last_order');

    notify.info('You have been logged out.');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        loading,
        isLoggingIn,
        isRegistering,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
