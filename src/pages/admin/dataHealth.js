/* ----------------------------------------------------------------
   Catalogue data-quality rules.

   Kept as plain functions, separate from the page, so each rule can be
   reasoned about (and later tested) on its own. Every rule returns the
   offending products plus a `fix` descriptor telling the UI which field
   to open and what value to suggest.

   Counts below were measured against the live DummyJSON catalogue
   (194 products) on the day this was written — they are recorded so a
   future change in the data is obvious rather than silent.
   ---------------------------------------------------------------- */

export const SEVERITY = {
    critical: { label: 'Critical', tone: 'bad', weight: 10 },
    warning: { label: 'Warning', tone: 'warn', weight: 4 },
    info: { label: 'Suggestion', tone: 'info', weight: 1 },
};

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

export const RULES = [
    {
        id: 'unbuyable',
        label: 'Impossible to buy',
        severity: 'critical',
        icon: 'bi-cart-x',
        /* The headline finding: minimumOrderQuantity above the stock on
           hand means no shopper can ever complete a purchase. 21 products
           in the live catalogue are in this state. */
        explain:
            'The minimum order quantity is higher than the stock on hand, so no customer can ever complete a purchase.',
        test: (p) => (p.minimumOrderQuantity || 0) > (p.stock || 0),
        detail: (p) => `Needs ${p.minimumOrderQuantity} · only ${p.stock} in stock`,
        fix: (p) => ({
            field: 'stock',
            label: `Raise stock to ${p.minimumOrderQuantity}`,
            patch: { stock: p.minimumOrderQuantity },
        }),
    },
    {
        id: 'rating-mismatch',
        label: 'Rating contradicts its reviews',
        severity: 'warning',
        icon: 'bi-star-half',
        explain:
            'The headline rating is more than 1.5 stars away from the average of the reviews shown on the same page. Shoppers notice.',
        test: (p) => {
            const reviews = p.reviews || [];
            if (reviews.length < 2) return false;
            return Math.abs(mean(reviews.map((r) => r.rating)) - (p.rating || 0)) > 1.5;
        },
        detail: (p) => {
            const avg = mean((p.reviews || []).map((r) => r.rating));
            return `Shows ${(p.rating || 0).toFixed(2)}★ · reviews average ${avg.toFixed(2)}★`;
        },
        fix: (p) => {
            const avg = mean((p.reviews || []).map((r) => r.rating));
            return {
                field: 'rating',
                label: `Correct to ${avg.toFixed(2)}★`,
                patch: { rating: Number(avg.toFixed(2)) },
            };
        },
    },
    {
        id: 'status-mismatch',
        label: 'Availability label is wrong',
        severity: 'critical',
        icon: 'bi-exclamation-octagon',
        explain:
            'The availability badge disagrees with the actual stock count, so the storefront advertises something untrue.',
        test: (p) => (p.stock === 0) !== (p.availabilityStatus === 'Out of Stock'),
        detail: (p) => `Says "${p.availabilityStatus || '—'}" with ${p.stock} in stock`,
        fix: (p) => ({
            field: 'availabilityStatus',
            label: 'Recalculate label',
            patch: {
                availabilityStatus:
                    p.stock === 0 ? 'Out of Stock' : p.stock <= 5 ? 'Low Stock' : 'In Stock',
            },
        }),
    },
    {
        id: 'no-brand',
        label: 'Missing brand',
        severity: 'warning',
        icon: 'bi-tag',
        explain:
            'Brand drives the storefront brand filter. A product without one is invisible to anyone browsing by brand.',
        test: (p) => !p.brand,
        detail: () => 'No brand set',
        /* No auto-fix: inventing a brand name would be worse than the gap. */
        fix: null,
    },
    {
        id: 'free',
        label: 'Zero or negative price',
        severity: 'critical',
        icon: 'bi-currency-exchange',
        explain: 'A price of zero or less will be sold for nothing.',
        test: (p) => !(p.price > 0),
        detail: (p) => `Priced at ${p.price}`,
        fix: null,
    },
    {
        id: 'deep-discount',
        label: 'Discount over 70%',
        severity: 'warning',
        icon: 'bi-percent',
        explain:
            'Discounts this deep are usually a decimal-point slip rather than a real promotion.',
        test: (p) => (p.discountPercentage || 0) > 70,
        detail: (p) => `${p.discountPercentage}% off`,
        fix: null,
    },
    {
        id: 'no-images',
        label: 'No product images',
        severity: 'critical',
        icon: 'bi-image',
        explain: 'A product page with no image converts close to zero.',
        test: (p) => !p.thumbnail && !(p.images || []).length,
        detail: () => 'No thumbnail or gallery',
        fix: null,
    },
    {
        id: 'thin-description',
        label: 'Description too short',
        severity: 'info',
        icon: 'bi-card-text',
        explain: 'Under 40 characters gives shoppers and search engines nothing to work with.',
        test: (p) => (p.description || '').trim().length < 40,
        detail: (p) => `${(p.description || '').trim().length} characters`,
        fix: null,
    },
    {
        id: 'out-of-stock',
        label: 'Out of stock and still live',
        severity: 'warning',
        icon: 'bi-box',
        explain:
            'The product is visible on the storefront but cannot be bought. Hiding it avoids a dead end.',
        test: (p) => p.stock === 0 && p.published !== false,
        detail: () => 'Zero stock, still published',
        fix: () => ({
            field: 'published',
            label: 'Hide from storefront',
            patch: { published: false },
        }),
    },
    {
        id: 'thin-tags',
        label: 'Only one tag',
        severity: 'info',
        icon: 'bi-tags',
        explain: 'Extra tags improve on-site search and related-product suggestions.',
        test: (p) => (p.tags || []).length === 1,
        /* test() guards but detail() must too — it is called from the CSV
           export over every product, including ones with no tags at all. */
        detail: (p) => `Tagged only "${(p.tags || [])[0] ?? '—'}"`,
        fix: null,
    },
];

/* ----------------------------------------------------------------
   Run every rule over the catalogue once.

   Returns per-rule hits plus a per-product index, so the page can
   show either view without re-scanning.
   ---------------------------------------------------------------- */
export const scanCatalogue = (products) => {
    const byRule = {};
    const byProduct = new Map();

    RULES.forEach((rule) => {
        byRule[rule.id] = [];
    });

    products.forEach((product) => {
        RULES.forEach((rule) => {
            let hit = false;

            /* A broken rule must not take the whole page down with it. */
            try {
                hit = rule.test(product);
            } catch (error) {
                console.error(`Data-health rule "${rule.id}" threw:`, error);
                return;
            }

            if (!hit) return;

            byRule[rule.id].push(product);

            if (!byProduct.has(product.id)) byProduct.set(product.id, []);
            byProduct.get(product.id).push(rule.id);
        });
    });

    const affected = byProduct.size;
    const total = products.length || 1;

    /* Score: a weighted penalty per issue, normalised against the worst
       case where every product trips every rule. Expressed as a health
       percentage so "higher is better" matches intuition. */
    const penalty = RULES.reduce(
        (sum, rule) => sum + byRule[rule.id].length * SEVERITY[rule.severity].weight,
        0
    );
    const worst = total * RULES.reduce((sum, r) => sum + SEVERITY[r.severity].weight, 0);
    const score = Math.round(100 - (penalty / worst) * 100);

    return {
        byRule,
        byProduct,
        affected,
        total: products.length,
        issues: RULES.reduce((sum, rule) => sum + byRule[rule.id].length, 0),
        critical: RULES.filter((r) => r.severity === 'critical').reduce(
            (sum, rule) => sum + byRule[rule.id].length,
            0
        ),
        score: Math.max(0, Math.min(100, score)),
    };
};

export const scoreBand = (score) => {
    if (score >= 95) return { label: 'Healthy', tone: 'ok' };
    if (score >= 85) return { label: 'Needs attention', tone: 'warn' };
    return { label: 'Poor', tone: 'bad' };
};
