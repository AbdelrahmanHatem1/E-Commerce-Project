import React, { useContext, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../contexts/ThemeContext.jsx';
import { AuthContext } from '../contexts/AuthContext.jsx';
import './Login.css';

const Login = () => {
  const { isDarkMode } = useContext(ThemeContext);
  const { login, isLoggingIn } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  /* ProtectedRoute stores where the visitor was heading before the
     redirect, so a successful sign-in resumes that journey. */
  const from = location.state?.from?.pathname || '/';

  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    /* Register redirects here with the username it just created. */
    email: location.state?.username || '',
    password: '',
    rememberMe: false,
  });

  /* Tell a freshly registered visitor why the field is already filled. */
  const justRegistered = Boolean(location.state?.username);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const fillDemo = () => {
    setFormData((prev) => ({ ...prev, email: 'emilys', password: 'emilyspass' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const result = await login(formData.email, formData.password, formData.rememberMe);

    if (result.success) {
      navigate(from, { replace: true });
    }
  };

  return (
    <div className={`login-page ${isDarkMode ? 'dark' : 'light'}`}>
      <div className="login-card">
        <h2>Welcome Back</h2>
        <p className="login-subtitle">Please enter your details to sign in.</p>

        {justRegistered && (
          <div className="login-banner" role="status">
            <i className="bi bi-check-circle-fill" aria-hidden="true" />
            <span>Account created. Sign in with your new credentials.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="email">Username or Email</label>
            <div className="input-with-icon">
              <i className="bi bi-envelope input-icon" aria-hidden="true" />
              <input
                id="email"
                type="text"
                name="email"
                placeholder="emilys"
                autoComplete="username"
                onChange={handleChange}
                value={formData.email}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <i className="bi bi-lock input-icon" aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="••••••••"
                autoComplete="current-password"
                onChange={handleChange}
                value={formData.password}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <i className={showPassword ? 'bi bi-eye' : 'bi bi-eye-slash'} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="login-options">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
              />
              <span>Remember me</span>
            </label>

            <a className="forgot-link" href="#forgot">Forgot password?</a>
          </div>

          <button type="submit" className="btn-primary" disabled={isLoggingIn}>
            {isLoggingIn ? (
              <>
                <span className="login-spinner" aria-hidden="true" />
                Signing In...
              </>
            ) : (
              <>
                Sign In
                <span className="signin-arrow">→</span>
              </>
            )}
          </button>
        </form>

        <div className="divider">Or continue with</div>

        <div className="social-buttons">
          <button type="button" className="btn-social google-btn">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.678 1.24 6.518l4.026 3.247z" />
              <path fill="#34A853" d="M16.04 18.214c-1.09.71-2.442 1.158-4.04 1.158-2.79 0-5.157-1.916-6.002-4.575L2.03 17.746C3.978 21.584 7.686 24 12 24c2.933 0 5.612-1.027 7.68-2.78l-3.64-3.006z" />
              <path fill="#4A90E2" d="M21.93 12.273c0-.845-.076-1.655-.218-2.438H12v4.437h5.51c-.24 1.278-.96 2.364-2.04 3.092l3.64 3.006c2.12-1.968 3.46-4.786 3.46-8.097z" />
              <path fill="#FBBC05" d="M5.266 14.235c-.275-.855-.44-1.767-.44-2.735 0-.968.165-1.88.44-2.735L1.24 5.518A11.95 11.95 0 0 0 0 11.5c0 1.767.34 3.455.955 4.982l4.311-3.247z" />
            </svg>
            Google
          </button>

          <button type="button" className="btn-social apple-btn">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="currentColor" />
            </svg>
            Apple
          </button>
        </div>

        <p className="login-demo">
          <i className="bi bi-info-circle" aria-hidden="true" />
          Demo account: <button type="button" onClick={fillDemo}>emilys / emilyspass</button>
        </p>

        <p className="register-link">
          Don&apos;t have an account? <Link to="/register">Sign Up</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
