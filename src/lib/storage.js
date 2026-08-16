/* ----------------------------------------------------------------
   One place for every localStorage read and write.

   Before this, thirteen files each carried their own try/catch copy of
   readJson/writeJson, and each swallowed quota errors slightly
   differently. Centralising it means a full disk is reported the same
   way everywhere, and usage can actually be measured.
   ---------------------------------------------------------------- */

export const KEYS = {
    user: 'user',
    theme: 'isDarkMode',
    cart: 'shopstream_cart_', // + userId
    saved: 'shopstream_saved_items',
    recent: 'shopstream_recently_viewed',
    lastOrder: 'shopstream_last_order', // sessionStorage
    orders: 'shopstream_order_history',
    wallet: 'shopstream_wallet',
    returns: 'shopstream_returns',
    currency: 'shopstream_currency',
    view: 'shopstream_view',
    rates: 'shopstream_rates',
    support: 'shopstream_support',
    faqVotes: 'shopstream_faq_votes',
    adminOverrides: 'shopstream_admin_overrides',
    adminDeleted: 'shopstream_admin_deleted',
    adminCreated: 'shopstream_admin_created',
    adminDemo: 'shopstream_admin_demo',
    adminUsers: 'shopstream_admin_users',
    /* Accounts created through Register. DummyJSON's /users/add returns a
       new id but persists nothing, so the account has to live here or the
       visitor can never sign in with what they just created. */
    localAccounts: 'shopstream_accounts',
    adminCarts: 'shopstream_admin_carts',
};

/* Human labels for the storage panel. */
export const KEY_LABELS = {
    [KEYS.orders]: 'Order history',
    [KEYS.wallet]: 'Wallet ledger',
    [KEYS.returns]: 'Return requests',
    [KEYS.support]: 'Support tickets',
    [KEYS.saved]: 'Saved items',
    [KEYS.recent]: 'Recently viewed',
    [KEYS.rates]: 'Exchange rates',
    [KEYS.faqVotes]: 'FAQ votes',
    [KEYS.adminOverrides]: 'Product edits',
    [KEYS.adminCreated]: 'Products you created',
    [KEYS.adminDeleted]: 'Archived products',
    [KEYS.adminUsers]: 'Customer edits',
    [KEYS.localAccounts]: 'Accounts created here',
    [KEYS.adminCarts]: 'Order decisions',
};

export const QUOTA_ERRORS = new Set([
    'QuotaExceededError',
    'NS_ERROR_DOM_QUOTA_REACHED',
]);

export const isQuotaError = (error) =>
    QUOTA_ERRORS.has(error?.name) || error?.code === 22 || error?.code === 1014;

/* Valid JSON of the wrong *shape* is as dangerous as broken JSON: a
   string where an array is expected reaches `.flatMap` and throws
   during render, which blanks the page. The fallback fixes the
   expected type, so anything that disagrees with it is discarded. */
export const readJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;

        const parsed = JSON.parse(raw);
        if (parsed === null || parsed === undefined) return fallback;

        if (Array.isArray(fallback) && !Array.isArray(parsed)) {
            console.warn(`${key}: expected an array, discarding stored value.`);
            return fallback;
        }

        if (
            fallback !== null &&
            typeof fallback === 'object' &&
            !Array.isArray(fallback) &&
            (typeof parsed !== 'object' || Array.isArray(parsed))
        ) {
            console.warn(`${key}: expected an object, discarding stored value.`);
            return fallback;
        }

        if (typeof fallback === 'boolean' && typeof parsed !== 'boolean') return fallback;

        return parsed;
    } catch (error) {
        console.error(`Failed to read ${key}:`, error);
        return fallback;
    }
};

/* Returns true, false, or the string 'quota' so callers can tell a
   full disk apart from a serialisation bug and say something useful. */
export const writeJson = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`Failed to write ${key}:`, error);
        return isQuotaError(error) ? 'quota' : false;
    }
};

/* A plain string write. `writeJson` would wrap it in quotes, and some
   values (a currency code, a view mode) are read back as raw strings by
   code that predates this module. Same quota handling, no JSON. */
export const writeText = (key, value) => {
    try {
        localStorage.setItem(key, String(value));
        return true;
    } catch (error) {
        console.error(`Failed to write ${key}:`, error);
        return isQuotaError(error) ? 'quota' : false;
    }
};

export const removeKey = (key) => {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error(`Failed to remove ${key}:`, error);
    }
};

/* ----------------------------------------------------------------
   Usage measurement.

   Browsers charge localStorage in UTF-16 code units — two bytes per
   character — and count the key name as well as the value. Measuring
   in "bytes of text" understates the real cost by roughly half, which
   is exactly the mistake the old image budget made.
   ---------------------------------------------------------------- */
export const BYTES_PER_CHAR = 2;

/* Conservative: the spec sets no figure, but ~5 MB is the de-facto
   floor across Chrome, Firefox and Safari. */
export const ASSUMED_QUOTA = 5 * 1024 * 1024;

export const keySize = (key) => {
    try {
        const value = localStorage.getItem(key);
        if (value === null) return 0;
        return (key.length + value.length) * BYTES_PER_CHAR;
    } catch {
        return 0;
    }
};

export const usageReport = () => {
    const entries = [];
    let total = 0;

    try {
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key) continue;

            const size = keySize(key);
            total += size;

            /* Per-user cart keys are collapsed into one row. */
            const label =
                KEY_LABELS[key] ||
                (key.startsWith(KEYS.cart) ? 'Shopping cart' : null) ||
                key;

            const existing = entries.find((entry) => entry.label === label);
            if (existing) existing.size += size;
            else entries.push({ key, label, size });
        }
    } catch (error) {
        console.error('Failed to measure storage:', error);
    }

    entries.sort((a, b) => b.size - a.size);

    return {
        entries,
        total,
        quota: ASSUMED_QUOTA,
        percent: Math.min(100, (total / ASSUMED_QUOTA) * 100),
    };
};

/* Ask the browser for the real numbers where it supports it. This
   covers IndexedDB too, which the localStorage walk above cannot see. */
export const quotaEstimate = async () => {
    try {
        if (navigator.storage?.estimate) {
            const { usage, quota } = await navigator.storage.estimate();
            return { usage: usage || 0, quota: quota || 0, supported: true };
        }
    } catch (error) {
        console.error('storage.estimate() failed:', error);
    }

    return { usage: 0, quota: 0, supported: false };
};

export const formatBytes = (bytes) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

export default { readJson, writeJson, removeKey, usageReport, formatBytes, KEYS };
