import React from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './AdminPager.css';

/* ----------------------------------------------------------------
   Numbered pagination with ellipsis, matching the design:
   ‹  1  2  3  …  32  ›

   buildPages keeps the bar a fixed width no matter how many pages
   exist, so 32 pages and 3200 pages render the same shape.
   ---------------------------------------------------------------- */
export const buildPages = (current, total, span = 1) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = new Set([1, total]);

    for (let page = current - span; page <= current + span; page += 1) {
        if (page > 1 && page < total) pages.add(page);
    }

    /* Near an edge the window collapses, so top it back up to keep the
       bar from visibly shrinking as you walk through the pages. */
    if (current <= 3) [2, 3, 4].forEach((page) => page < total && pages.add(page));
    if (current >= total - 2) {
        [total - 3, total - 2, total - 1].forEach((page) => page > 1 && pages.add(page));
    }

    const sorted = [...pages].sort((a, b) => a - b);
    const output = [];

    sorted.forEach((page, index) => {
        const previous = sorted[index - 1];
        if (previous && page - previous > 1) output.push({ gap: true, after: previous });
        output.push(page);
    });

    return output;
};

const AdminPager = ({
    page,
    totalPages,
    totalItems,
    pageSize,
    onPage,
    onPageSize,
    label = 'items',
    pageSizes = [10, 25, 50, 100],
}) => {
    if (!totalItems) return null;

    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, totalItems);
    const go = (next) => onPage(Math.min(totalPages, Math.max(1, next)));

    return (
        <div className="pg">
            <span className="pg-count">
                Showing <strong>{from.toLocaleString()}</strong> to <strong>{to.toLocaleString()}</strong> of{' '}
                <strong>{totalItems.toLocaleString()}</strong> {label}
            </span>

            <div className="pg-right">
                {onPageSize && (
                    <label className="pg-size">
                        <span>Rows</span>
                        <select
                            value={pageSize}
                            onChange={(event) => onPageSize(Number(event.target.value))}
                            aria-label="Rows per page"
                        >
                            {pageSizes.map((size) => (
                                <option key={size} value={size}>
                                    {size}
                                </option>
                            ))}
                        </select>
                    </label>
                )}

                <nav className="pg-nav" aria-label="Pagination">
                    <button
                        type="button"
                        className="pg-arrow"
                        onClick={() => go(page - 1)}
                        disabled={page === 1}
                        aria-label="Previous page"
                    >
                        <i className="bi bi-chevron-left" aria-hidden="true" />
                    </button>

                    {buildPages(page, totalPages).map((entry) =>
                        typeof entry === 'number' ? (
                            <button
                                key={entry}
                                type="button"
                                className={`pg-num ${entry === page ? 'is-active' : ''}`}
                                onClick={() => go(entry)}
                                aria-current={entry === page ? 'page' : undefined}
                                aria-label={`Page ${entry}`}
                            >
                                {entry}
                            </button>
                        ) : (
                            /* The ellipsis jumps a window instead of being dead text. */
                            <button
                                key={`gap-${entry.after}`}
                                type="button"
                                className="pg-gap"
                                onClick={() => go(entry.after < page ? page - 5 : page + 5)}
                                aria-label={entry.after < page ? 'Jump back 5 pages' : 'Jump forward 5 pages'}
                                title={entry.after < page ? 'Back 5 pages' : 'Forward 5 pages'}
                            >
                                …
                            </button>
                        )
                    )}

                    <button
                        type="button"
                        className="pg-arrow"
                        onClick={() => go(page + 1)}
                        disabled={page === totalPages}
                        aria-label="Next page"
                    >
                        <i className="bi bi-chevron-right" aria-hidden="true" />
                    </button>
                </nav>
            </div>
        </div>
    );
};

export default AdminPager;
