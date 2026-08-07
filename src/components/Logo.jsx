import React from 'react';
import './Logo.css';

/* ----------------------------------------------------------------
   The ShopStream mark.

   An inline SVG rather than an image file, for four reasons:

     * it paints in `currentColor`, so it follows --ss-accent and
       changes with the season on its own — an <img> would need one
       export per theme, times two for dark mode;
     * it is sharp at 24px in the navbar and at 512px on a splash
       screen, at any pixel density;
     * it ships inside the bundle, so it is on screen with the first
       frame instead of arriving a request later;
     * the stream lines can animate independently, which a flat
       image cannot do.

   The mark itself is a shopping bag whose left wall dissolves into
   three motion lines — "shop" plus "stream". The lines are staggered
   in length so they read as flow rather than as a menu icon.
   ---------------------------------------------------------------- */

export const LogoMark = ({ size = 32, className = '', animated = true }) => (
    <svg
        className={`lg-mark ${animated ? 'is-animated' : ''} ${className}`.trim()}
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        /* Decorative: the wordmark beside it carries the name, so a
           screen reader announcing both would just repeat itself. */
        aria-hidden="true"
        focusable="false"
    >
        {/* The bag body. Drawn as a path rather than a rect so the
        shoulders can taper, which stops it reading as a plain box. */}
        <path
            d="M15.5 15h17a3 3 0 0 1 2.99 2.74l1.75 20A3 3 0 0 1 34.25 41H13.75a3 3 0 0 1-2.99-3.26l1.75-20A3 3 0 0 1 15.5 15Z"
            className="lg-bag"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
        />

        {/* The handle. Open at the bottom so it reads as a loop over the
        bag rather than a circle behind it. */}
        <path
            d="M18.5 20v-6a5.5 5.5 0 0 1 11 0v6"
            className="lg-handle"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
        />

        {/* Three motion lines flowing into the bag's left edge. Staggered
        lengths and a shared cap radius make them read as speed. */}
        <path d="M9 21H2.5" className="lg-stream lg-stream-1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M7.5 28H1" className="lg-stream lg-stream-2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M9 35H4" className="lg-stream lg-stream-3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

/* ----------------------------------------------------------------
   Mark plus wordmark.

   `to` is optional: in the navbar the logo is a link home, but on a
   login screen or an invoice it is just an image, and nesting a link
   inside another link is invalid HTML.
   ---------------------------------------------------------------- */
const Logo = ({
    size = 32,
    showText = true,
    className = '',
    animated = true,
    as: Tag = 'span',
    ...rest
}) => (
    <Tag className={`lg-logo ${className}`.trim()} {...rest}>
        <LogoMark size={size} animated={animated} />

        {showText && (
            <span className="lg-word">
                {/* Two spans so the weight can shift mid-word — the join is
            what makes it a wordmark instead of a heading. */}
                <span className="lg-word-a">Shop</span>
                <span className="lg-word-b">Stream</span>
            </span>
        )}
    </Tag>
);

export default Logo;
