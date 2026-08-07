import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';

import HomePage from './pages/HomePage.jsx';
import CartPage from './pages/CartPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import ProductDetailsPage from './pages/ProductDetailsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import ReturnsPage from './pages/ReturnsPage.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminInventory from './pages/admin/AdminInventory.jsx';
import AdminOrders from './pages/admin/AdminOrders.jsx';
import AdminCustomers from './pages/admin/AdminCustomers.jsx';
import AdminReturns from './pages/admin/AdminReturns.jsx';
import AdminSupport from './pages/admin/AdminSupport.jsx';
import AdminHealth from './pages/admin/AdminHealth.jsx';
import AdminStorage from './pages/admin/AdminStorage.jsx';
import AdminBuilder from './pages/admin/AdminBuilder.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';
import CustomPage from './pages/CustomPage.jsx';
import SupportPage from './pages/SupportPage.jsx';
import LegalPage from './pages/LegalPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import OrderConfirmation from './pages/OrderConfirmation.jsx';
import Register from './components/Register.jsx';
import Login from './components/Login.jsx';

import ProtectedRoute, { GuestRoute } from './components/ProtectedRoute.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { NotificationProvider } from './components/Notification.jsx';

const Router = () => {
  return (
    <BrowserRouter>
      <NotificationProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<App />}>
              {/* ---------------------- public ---------------------- */}
              <Route index element={<HomePage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="product/:id" element={<ProductDetailsPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              {/* Admin-built pages live under /p/ so they can never
                  shadow a real storefront route. */}
              <Route path="p/:slug" element={<CustomPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="privacy" element={<LegalPage kind="privacy" />} />
              <Route path="terms" element={<LegalPage kind="terms" />} />

              {/* ------------- signed-out visitors only ------------- */}
              <Route element={<GuestRoute />}>
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
              </Route>

              {/* --------------- signed-in visitors ----------------- */}
              <Route element={<ProtectedRoute />}>
                <Route path="profile" element={<ProfilePage />} />
                <Route path="orders" element={<ProfilePage />} />
                <Route path="returns" element={<ReturnsPage />} />

                {/* ---------------------- admin ---------------------- */}
                <Route path="admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="inventory" element={<AdminInventory />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="customers" element={<AdminCustomers />} />
                  <Route path="returns" element={<AdminReturns />} />
                  <Route path="support" element={<AdminSupport />} />
                  <Route path="health" element={<AdminHealth />} />
                  <Route path="builder" element={<AdminBuilder />} />
                  <Route path="storage" element={<AdminStorage />} />
                </Route>
                <Route path="checkout" element={<CheckoutPage />} />
                <Route path="order-confirmation" element={<OrderConfirmation />} />
              </Route>

              {/* --------------------- fallback --------------------- */}
              <Route path="*" element={<HomePage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </NotificationProvider>
    </BrowserRouter>
  );
};

export default Router;
