import React, { useContext, useEffect, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext.jsx';
import { ThemeContext } from '../contexts/ThemeContext.jsx';
import { useNotification } from './Notification.jsx';
import './Register.css';

const API = 'https://dummyjson.com';

/* ----------------------------------------------------------------
   Password strength — pure local scoring, no library needed.
   ---------------------------------------------------------------- */
const scorePassword = (password) => {
  if (!password) return { score: 0, label: '', checks: {} };

  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;
  const label = score <= 2 ? 'Weak' : score === 3 ? 'Fair' : score === 4 ? 'Good' : 'Strong';

  return { score, label, checks };
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

const Register = () => {
  const { isDarkMode } = useContext(ThemeContext);
  const { register, isRegistering } = useContext(AuthContext);
  const { notify } = useNotification();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);

  /* Live username availability against DummyJSON. */
  const [usernameState, setUsernameState] = useState({ status: 'idle', message: '' });
  const usernameTimerRef = useRef(null);

  const strength = scorePassword(formData.password);

  /* -------------------------------------------------------------
     Debounced username check — DummyJSON happily accepts duplicate
     usernames on /users/add, so we verify it ourselves.
     ------------------------------------------------------------- */
  useEffect(() => {
    const username = formData.username.trim();

    clearTimeout(usernameTimerRef.current);

    if (!username) {
      setUsernameState({ status: 'idle', message: '' });
      return undefined;
    }

    if (!USERNAME_PATTERN.test(username)) {
      setUsernameState({
        status: 'invalid',
        message: '3-20 characters, letters, numbers and underscore only.',
      });
      return undefined;
    }

    setUsernameState({ status: 'checking', message: 'Checking availability…' });

    let cancelled = false;

    usernameTimerRef.current = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API}/users/filter`, {
          params: { key: 'username', value: username },
        });

        if (cancelled) return;

        if (data.total > 0) {
          setUsernameState({ status: 'taken', message: 'That username is already taken.' });
        } else {
          setUsernameState({ status: 'available', message: 'Username is available.' });
        }
      } catch (error) {
        console.error('Username check failed:', error);
        if (!cancelled) setUsernameState({ status: 'idle', message: '' });
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(usernameTimerRef.current);
    };
  }, [formData.username]);

  /* ------------------------------ helpers ------------------------------ */
  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
  };

  const errors = {
    fullName: formData.fullName.trim().length < 2 ? 'Please enter your full name.' : '',
    username:
      usernameState.status === 'taken' || usernameState.status === 'invalid'
        ? usernameState.message
        : '',
    email: formData.email && !EMAIL_PATTERN.test(formData.email) ? 'Enter a valid email.' : '',
    password: formData.password && strength.score < 3 ? 'Choose a stronger password.' : '',
    confirmPassword:
      formData.confirmPassword && formData.confirmPassword !== formData.password
        ? 'Passwords do not match.'
        : '',
  };

  const showError = (field) => touched[field] && errors[field];

  /* ------------------------------ submit ------------------------------- */
  const handleSubmit = async (event) => {
    event.preventDefault();

    setTouched({
      fullName: true,
      username: true,
      email: true,
      password: true,
      confirmPassword: true,
    });

    if (!formData.fullName.trim()) {
      notify.error('Missing name', 'Please enter your full name.');
      return;
    }

    if (!USERNAME_PATTERN.test(formData.username.trim())) {
      notify.error('Invalid username', '3-20 characters, letters, numbers and underscore only.');
      return;
    }

    if (usernameState.status === 'taken') {
      notify.error('Username taken', 'Please pick a different username.');
      return;
    }

    if (usernameState.status === 'checking') {
      notify.info('Still checking that username — one moment.');
      return;
    }

    if (!EMAIL_PATTERN.test(formData.email)) {
      notify.error('Invalid email', 'Please enter a valid email address.');
      return;
    }

    if (strength.score < 3) {
      notify.error(
        'Weak password',
        'Use at least 8 characters with a mix of letters, numbers and symbols.'
      );
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      notify.error('Passwords do not match', 'Please retype your password.');
      return;
    }

    if (!agreed) {
      notify.warning('Please accept the Terms of Service to continue.');
      return;
    }

    try {
      const result = await register(formData);

      if (result.success) {
        notify.success(
          `Welcome, ${result.user.firstName || formData.username}! Your account is ready.`
        );
        /* Registering signs you in, so sending you to the login page to
           retype the credentials you just chose would be busywork. */
        navigate('/', { replace: true });
      } else {
        notify.error('Registration Failed', result.message);
      }
    } catch (error) {
      console.error('Registration error:', error);
      notify.error('Registration Error', 'An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div className={`register-page ${isDarkMode ? 'dark' : 'light'}`}>
      <div className="register-card">
        <h2>Create Account</h2>
        <p className="register-subtitle">
          Join ShopStream for a personalized shopping experience.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {/* ---------------------- full name ---------------------- */}
          <div className="form-group">
            <label htmlFor="fullName">Full Name</label>
            <div className="input-with-icon">
              <i className="bi bi-person input-icon" aria-hidden="true" />
              <input
                id="fullName"
                type="text"
                name="fullName"
                placeholder="John Doe"
                onChange={handleChange}
                onBlur={handleBlur}
                value={formData.fullName}
                autoComplete="name"
                aria-invalid={Boolean(showError('fullName'))}
              />
            </div>
            {showError('fullName') && <p className="field-error">{errors.fullName}</p>}
          </div>

          <div className="form-row">
            {/* ---------------------- username ---------------------- */}
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <div className={`input-with-icon is-${usernameState.status}`}>
                <i className="bi bi-at input-icon" aria-hidden="true" />
                <input
                  id="username"
                  type="text"
                  name="username"
                  placeholder="johndoe"
                  onChange={handleChange}
                  onBlur={handleBlur}
                  value={formData.username}
                  autoComplete="username"
                  aria-describedby="username-status"
                />

                {usernameState.status === 'checking' && (
                  <span className="input-spinner" aria-hidden="true" />
                )}
                {usernameState.status === 'available' && (
                  <i className="bi bi-check-circle-fill input-status is-ok" aria-hidden="true" />
                )}
                {(usernameState.status === 'taken' || usernameState.status === 'invalid') && (
                  <i className="bi bi-x-circle-fill input-status is-bad" aria-hidden="true" />
                )}
              </div>

              {usernameState.message && (
                <p
                  id="username-status"
                  className={`field-hint is-${usernameState.status}`}
                  aria-live="polite"
                >
                  {usernameState.message}
                </p>
              )}
            </div>

            {/* ------------------------ email ----------------------- */}
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-with-icon">
                <i className="bi bi-envelope input-icon" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="john@example.com"
                  onChange={handleChange}
                  onBlur={handleBlur}
                  value={formData.email}
                  autoComplete="email"
                  aria-invalid={Boolean(showError('email'))}
                />
              </div>
              {showError('email') && <p className="field-error">{errors.email}</p>}
            </div>
          </div>

          {/* ----------------------- password ----------------------- */}
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <i className="bi bi-lock input-icon" aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="••••••••"
                onChange={handleChange}
                onBlur={handleBlur}
                value={formData.password}
                autoComplete="new-password"
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

            {formData.password && (
              <div className="password-strength">
                <div className="strength-bars" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <span
                      key={step}
                      className={`strength-bar ${step <= strength.score ? 'is-filled' : ''} level-${strength.score}`}
                    />
                  ))}
                </div>
                <span className={`strength-label level-${strength.score}`}>{strength.label}</span>
              </div>
            )}

            {formData.password && strength.score < 5 && (
              <ul className="password-checks">
                <li className={strength.checks.length ? 'is-met' : ''}>
                  <i className={`bi ${strength.checks.length ? 'bi-check2' : 'bi-dash'}`} />8+
                  characters
                </li>
                <li className={strength.checks.upper && strength.checks.lower ? 'is-met' : ''}>
                  <i
                    className={`bi ${strength.checks.upper && strength.checks.lower ? 'bi-check2' : 'bi-dash'}`}
                  />
                  Upper &amp; lowercase
                </li>
                <li className={strength.checks.number ? 'is-met' : ''}>
                  <i className={`bi ${strength.checks.number ? 'bi-check2' : 'bi-dash'}`} />
                  A number
                </li>
                <li className={strength.checks.symbol ? 'is-met' : ''}>
                  <i className={`bi ${strength.checks.symbol ? 'bi-check2' : 'bi-dash'}`} />A symbol
                </li>
              </ul>
            )}
          </div>

          {/* -------------------- confirm password ------------------- */}
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-with-icon">
              <i className="bi bi-shield-check input-icon" aria-hidden="true" />
              <input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                name="confirmPassword"
                placeholder="••••••••"
                onChange={handleChange}
                onBlur={handleBlur}
                value={formData.confirmPassword}
                autoComplete="new-password"
                aria-invalid={Boolean(showError('confirmPassword'))}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                <i className={showConfirm ? 'bi bi-eye' : 'bi bi-eye-slash'} aria-hidden="true" />
              </button>
            </div>
            {showError('confirmPassword') && (
              <p className="field-error">{errors.confirmPassword}</p>
            )}
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              I agree to the <Link to="/terms">Terms of Service</Link> and{' '}
              <Link to="/privacy">Privacy Policy</Link>.
            </span>
          </label>

          <button type="submit" className="btn-primary" disabled={isRegistering}>
            {isRegistering ? (
              <>
                <span className="register-spinner" aria-hidden="true" />
                Creating Account...
              </>
            ) : (
              <>
                Create Account
                <span className="signup-arrow">→</span>
              </>
            )}
          </button>
        </form>

        <div className="divider">Or sign up with</div>

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

        <p className="login-link">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
