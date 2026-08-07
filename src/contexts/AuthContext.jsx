import React, { createContext, useEffect, useState } from 'react';
import axios from 'axios';
import { useNotification } from '../components/Notification.jsx';

export const AuthContext = createContext();

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

  const login = async (usernameOrEmail, password, rememberMe = false) => {
    setIsLoggingIn(true);

    try {
      if (!usernameOrEmail || !password) {
        notify.error('Login Error', 'Please fill in all fields.');
        return { success: false, message: 'Please fill in all fields.' };
      }

      const response = await axios.post('https://dummyjson.com/auth/login', {
        username: usernameOrEmail,
        password,
      });

      const userData = response.data;
      setUser(userData);

      /* Keep one single source of truth for the session. */
      if (rememberMe) {
        sessionStorage.removeItem('user');
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        localStorage.removeItem('user');
        sessionStorage.setItem('user', JSON.stringify(userData));
      }

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

  const register = async (formData) => {
    setIsRegistering(true);

    try {
      const [firstName, ...rest] = (formData.fullName || '').trim().split(' ');

      const response = await axios.post('https://dummyjson.com/users/add', {
        firstName: firstName || formData.username,
        lastName: rest.join(' '),
        username: formData.username,
        email: formData.email,
        password: formData.password,
      });

      return { success: true, user: response.data };
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
