import React, { useContext, useState } from 'react';
import { Container } from 'react-bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Link } from 'react-router-dom';
import { ThemeContext } from '../contexts/ThemeContext.jsx';
import { useNotification } from './Notification.jsx';
import './Footer.css';

const FOOTER_COLUMNS = [
  {
    title: 'SHOP',
    links: [
      /* These params must match what ProductsPage reads: cat / q / sort. */
      { label: 'All Electronics', to: '/products?cat=electronics' },
      { label: 'Wearables', to: '/products?q=watch' },
      { label: 'Home Office', to: '/products?q=laptop' },
      { label: 'New Arrivals', to: '/products?sort=newest' },
    ],
  },
  {
    title: 'SUPPORT',
    links: [
      { label: 'Contact Us', to: '/support' },
      { label: 'Shipping Info', to: '/support#shipping' },
      { label: 'Returns', to: '/support#returns' },
      { label: 'FAQ', to: '/support#faq' },
    ],
  },
  {
    title: 'LEGAL',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Service', to: '/terms' },
    ],
  },
];

const SOCIAL_LINKS = [
  { icon: 'bi-globe2', label: 'Explore ShopStream worldwide', href: 'https://shopstream.example' },
  { icon: 'bi-card-text', label: 'Read ShopStream news', href: 'https://shopstream.example/blog' },
  { icon: 'bi-camera', label: 'View ShopStream media', href: 'https://shopstream.example/media' },
];

/* Inline SVG marks. Unlike the simple-icons CDN files these carry their
   own colours, so they stay visible in both themes and never depend on
   an external request. */
const PaymentMarks = () => (
  <div className="payment-icons" aria-label="Accepted payment methods">
    <span className="payment-mark" title="Visa">
      <svg viewBox="0 0 48 16" role="img" aria-label="Visa">
        <text
          x="0"
          y="13"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="15"
          fontWeight="700"
          fontStyle="italic"
          fill="currentColor"
        >
          VISA
        </text>
      </svg>
    </span>

    <span className="payment-mark" title="Mastercard">
      <svg viewBox="0 0 40 24" role="img" aria-label="Mastercard">
        <circle cx="15" cy="12" r="9" fill="#eb001b" />
        <circle cx="25" cy="12" r="9" fill="#f79e1b" />
        <path
          d="M20 5.2a9 9 0 0 0 0 13.6 9 9 0 0 0 0-13.6z"
          fill="#ff5f00"
        />
      </svg>
    </span>

    <span className="payment-mark" title="PayPal">
      <svg viewBox="0 0 24 24" role="img" aria-label="PayPal">
        <path
          d="M7.08 21.34H3.9a.53.53 0 0 1-.52-.61L6.2 2.9a.75.75 0 0 1 .74-.63h6.3c3.2 0 5.35 1.62 4.9 4.9-.5 3.7-3.06 5.33-6.4 5.33H9.4a.75.75 0 0 0-.74.63l-.84 7.5a.53.53 0 0 1-.52.6z"
          fill="#003087"
        />
        <path
          d="M18.9 7.9c.6 2.9-1.5 6.4-5.6 6.4h-2a.75.75 0 0 0-.74.64l-.8 6.9h3.1a.66.66 0 0 0 .65-.55l.75-4.7a.66.66 0 0 1 .65-.56h1.1c3 0 4.9-1.45 5.35-4.4.3-1.9-.4-3.1-1.6-3.7z"
          fill="#009cde"
        />
      </svg>
    </span>
  </div>
);

const Footer = () => {
  const { isDarkMode } = useContext(ThemeContext);
  const { notify } = useNotification();
  const [email, setEmail] = useState('');

  const currentYear = new Date().getFullYear();

  const handleSubscribe = (event) => {
    event.preventDefault();

    const value = email.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      notify.error('Invalid email', 'Please enter a valid email address to subscribe.');
      return;
    }

    setEmail('');
    notify.success('You are subscribed. Watch your inbox for early access drops.');
  };

  return (
    <footer className={`footer-section ${isDarkMode ? 'dark' : 'light'}`}>
      <Container>
        <div className="footer-content">
          <div className="footer-brand">
            <h3>ShopStream</h3>
            <p>
              A premium e-commerce experience dedicated to delivering the world&apos;s most
              innovative electronics right to your doorstep.
            </p>

            <form className="footer-subscribe" onSubmit={handleSubscribe}>
              <label className="visually-hidden" htmlFor="footer-email">
                Email address
              </label>
              <input
                id="footer-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Your email address"
                autoComplete="email"
              />
              <button type="submit">
                Subscribe
                <i className="bi bi-arrow-right" aria-hidden="true" />
              </button>
            </form>

            <div className="social-icons" aria-label="ShopStream links">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.icon}
                  href={social.href}
                  className="social-icon"
                  aria-label={social.label}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className={`bi ${social.icon}`} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          <div className="footer-links">
            {FOOTER_COLUMNS.map((column) => (
              <div className="footer-column" key={column.title}>
                <h4>{column.title}</h4>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link to={link.to}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {currentYear} ShopStream Inc. All rights reserved.</p>
          <PaymentMarks />
        </div>
      </Container>
    </footer>
  );
};

export default Footer;
