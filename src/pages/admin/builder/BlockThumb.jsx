import React from 'react';

/* ----------------------------------------------------------------
   A miniature drawing of what each block looks like.

   An icon tells you the name of a thing; a shape tells you what you
   are about to get. These are hand-drawn SVGs rather than scaled-down
   real blocks because a real block at 96px wide would be an unreadable
   smudge — the point is to communicate the silhouette.

   `currentColor` throughout, so a thumb inherits the palette and works
   in both themes without a second copy.
   ---------------------------------------------------------------- */

const bar = (x, y, w, h, o = 1, r = 2) => (
    <rect x={x} y={y} width={w} height={h} rx={r} fill="currentColor" opacity={o} />
);

const SHAPES = {
    /* --------------------------- storefront -------------------------- */
    hero: (
        <>
            <rect x="0" y="0" width="96" height="54" rx="4" fill="currentColor" opacity=".1" />
            {bar(8, 12, 34, 4, 0.75)}
            {bar(8, 21, 44, 7, 0.9)}
            {bar(8, 33, 26, 4, 0.45)}
            {bar(8, 42, 18, 6, 0.85, 3)}
            <circle cx="72" cy="27" r="15" fill="currentColor" opacity=".28" />
        </>
    ),
    featured: (
        <>
            {bar(8, 6, 30, 4, 0.7)}
            {[8, 32, 56, 80].map((x) => (
                <g key={x}>
                    <rect x={x} y="16" width="16" height="18" rx="2" fill="currentColor" opacity=".3" />
                    {bar(x, 37, 14, 3, 0.5)}
                    {bar(x, 43, 9, 3, 0.7)}
                </g>
            ))}
        </>
    ),
    categories: (
        <>
            {bar(8, 6, 26, 4, 0.7)}
            {[8, 38, 68].map((x) => (
                <rect key={x} x={x} y="15" width="24" height="30" rx="4" fill="currentColor" opacity=".3" />
            ))}
        </>
    ),
    deals: (
        <>
            {bar(8, 6, 24, 4, 0.7)}
            <rect x="60" y="4" width="28" height="9" rx="4" fill="currentColor" opacity=".5" />
            {[8, 36, 64].map((x) => (
                <g key={x}>
                    <rect x={x} y="18" width="24" height="16" rx="2" fill="currentColor" opacity=".3" />
                    {bar(x, 37, 16, 3, 0.55)}
                </g>
            ))}
        </>
    ),
    topRated: (
        <>
            {bar(8, 6, 28, 4, 0.7)}
            {[8, 36, 64].map((x) => (
                <g key={x}>
                    <rect x={x} y="16" width="24" height="17" rx="2" fill="currentColor" opacity=".3" />
                    {[0, 5, 10, 15, 20].map((s) => (
                        <circle key={s} cx={x + 2 + s} cy="39" r="1.6" fill="currentColor" opacity=".65" />
                    ))}
                </g>
            ))}
        </>
    ),
    recent: (
        <>
            {bar(8, 6, 32, 4, 0.7)}
            {[8, 30, 52, 74].map((x) => (
                <rect key={x} x={x} y="16" width="18" height="24" rx="3" fill="currentColor" opacity=".26" />
            ))}
        </>
    ),
    testimonials: (
        <>
            {[8, 36, 64].map((x) => (
                <g key={x}>
                    <rect x={x} y="10" width="24" height="34" rx="4" fill="currentColor" opacity=".16" />
                    <circle cx={x + 8} cy="20" r="4" fill="currentColor" opacity=".5" />
                    {bar(x + 4, 28, 16, 2.5, 0.4)}
                    {bar(x + 4, 33, 12, 2.5, 0.4)}
                </g>
            ))}
        </>
    ),
    benefits: (
        <>
            {[6, 30, 54, 78].map((x) => (
                <g key={x}>
                    <circle cx={x + 6} cy="22" r="6" fill="currentColor" opacity=".38" />
                    {bar(x, 33, 14, 3, 0.5)}
                </g>
            ))}
        </>
    ),
    newsletter: (
        <>
            <rect x="0" y="0" width="96" height="54" rx="4" fill="currentColor" opacity=".12" />
            {bar(26, 12, 44, 5, 0.75)}
            {bar(20, 23, 56, 3, 0.4)}
            <rect x="18" y="32" width="40" height="11" rx="5" fill="currentColor" opacity=".25" />
            <rect x="61" y="32" width="19" height="11" rx="5" fill="currentColor" opacity=".65" />
        </>
    ),

    /* ---------------------------- content ---------------------------- */
    text: (
        <>
            {bar(20, 12, 24, 3, 0.5)}
            {bar(14, 20, 68, 7, 0.85)}
            {bar(22, 32, 52, 3, 0.4)}
            {bar(30, 39, 36, 3, 0.4)}
        </>
    ),
    cards: (
        <>
            {[6, 36, 66].map((x) => (
                <g key={x}>
                    <rect x={x} y="10" width="24" height="34" rx="4" fill="currentColor" opacity=".2" />
                    <circle cx={x + 12} cy="21" r="5" fill="currentColor" opacity=".55" />
                    {bar(x + 5, 30, 14, 3, 0.55)}
                    {bar(x + 5, 36, 10, 2.5, 0.35)}
                </g>
            ))}
        </>
    ),
    banner: (
        <>
            <rect x="0" y="0" width="96" height="54" rx="4" fill="currentColor" opacity=".3" />
            {bar(24, 16, 48, 8, 0.85)}
            {bar(32, 29, 32, 3, 0.55)}
            <rect x="36" y="37" width="24" height="9" rx="4" fill="currentColor" opacity=".8" />
        </>
    ),
    productRail: (
        <>
            {bar(8, 6, 30, 4, 0.7)}
            {[8, 31, 54, 77].map((x) => (
                <g key={x}>
                    <rect x={x} y="15" width="17" height="17" rx="2" fill="currentColor" opacity=".3" />
                    {bar(x, 35, 15, 2.5, 0.45)}
                    {bar(x, 40, 9, 3, 0.7)}
                </g>
            ))}
        </>
    ),
    countdown: (
        <>
            {bar(28, 8, 40, 4, 0.6)}
            {[10, 33, 56, 79].map((x) => (
                <g key={x}>
                    <rect x={x - 2} y="19" width="17" height="18" rx="3" fill="currentColor" opacity=".26" />
                    {bar(x + 2, 25, 9, 6, 0.75)}
                </g>
            ))}
        </>
    ),

    /* ----------------------------- layout ---------------------------- */
    spacer: (
        <>
            {bar(8, 8, 80, 3, 0.22)}
            <line x1="48" y1="18" x2="48" y2="36" stroke="currentColor" strokeWidth="1.5"
                strokeDasharray="3 3" opacity=".55" />
            <path d="M44 20l4-4 4 4M44 34l4 4 4-4" stroke="currentColor" strokeWidth="1.5"
                fill="none" opacity=".65" />
            {bar(8, 43, 80, 3, 0.22)}
        </>
    ),
    marquee: (
        <>
            <rect x="0" y="18" width="96" height="18" rx="3" fill="currentColor" opacity=".16" />
            {bar(6, 25, 20, 4, 0.6)}
            {bar(32, 25, 14, 4, 0.45)}
            {bar(52, 25, 22, 4, 0.6)}
            {bar(80, 25, 12, 4, 0.45)}
            <path d="M92 20l4 7-4 7" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".5" />
        </>
    ),
};

const BlockThumb = ({ type, className = '' }) => (
    <svg
        className={`bt ${className}`}
        viewBox="0 0 96 54"
        role="img"
        aria-hidden="true"
        focusable="false"
    >
        {SHAPES[type] || <rect x="6" y="6" width="84" height="42" rx="4" fill="currentColor" opacity=".2" />}
    </svg>
);

export default BlockThumb;
