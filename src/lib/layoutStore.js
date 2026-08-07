/* ----------------------------------------------------------------
   Layout persistence on IndexedDB.

   A profile is a named arrangement: an ordered list of blocks, a theme
   choice, and the rules that decide when and to whom it is shown.
   Profiles can get large — a dozen blocks each carrying colours,
   animation settings and card lists — and images inside them are
   already IndexedDB references, so keeping the documents in the same
   database avoids a second storage budget to reason about.

   localStorage keeps only short strings: which home layout is active,
   and which A/B bucket this visitor landed in. Reading those
   synchronously on boot means the storefront never flashes the wrong
   layout while IndexedDB opens.
   ---------------------------------------------------------------- */

const DB_NAME = 'shopstream-layouts';
const DB_VERSION = 2;
const STORE = 'profiles';
const TEMPLATE_STORE = 'templates';

export const ACTIVE_KEY = 'shopstream_layout_active';
export const BUCKET_KEY = 'shopstream_ab_bucket';

let dbPromise = null;

export const layoutsAvailable = () => {
    try {
        return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
        return false;
    }
};

const openDb = () => {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        if (!layoutsAvailable()) {
            reject(new Error('IndexedDB is not available.'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' });
            }
            /* Added in v2 — saved section templates. */
            if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
                db.createObjectStore(TEMPLATE_STORE, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Upgrade blocked by another tab.'));
    });

    dbPromise.catch(() => {
        dbPromise = null;
    });

    return dbPromise;
};

const tx = async (mode, run, storeName = STORE) => {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;

        try {
            result = run(store);
        } catch (error) {
            reject(error);
            return;
        }

        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
};

const ask = (request) =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

/* ------------------------------ shape ----------------------------- */

export const makeProfileId = () =>
    `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/* A URL-safe slug. Two different names must never collide silently,
   so the caller checks uniqueness before saving. */
export const slugify = (text) =>
    String(text || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);

export const emptyProfile = (name = 'Untitled layout', kind = 'home') => ({
    id: makeProfileId(),
    name,
    /* 'home' replaces the storefront home page; 'page' is a standalone
       route the admin can link from the navbar. */
    kind,
    slug: kind === 'page' ? slugify(name) || 'new-page' : '',
    navLabel: name,
    showInNav: false,
    live: false,
    theme: 'default',
    followSeason: false,
    blocks: [],
    schedule: { enabled: false, startsAt: '', endsAt: '' },
    ab: { enabled: false, variantId: '', split: 50 },
    seo: { title: '', description: '' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
});

/* ------------------------------ reads ----------------------------- */

/* ------------------------------------------------------------------
   Migration applied on read.

   Two settings used to live on storefront blocks that should never
   have been there:

     * a single shared default of `limit: 8`, which made Top Categories
       draw a lopsided mosaic and asked the three-up testimonial grid
       for eight quotes;
     * `minHeight` / `maxWidth`, which fought the section's own
       container and vertical rhythm.

   Both controls are now gone from the inspector for these blocks, but
   a profile saved earlier still carries the values — and with no
   control left, the admin could not clear them. Fixing them on read
   means an existing layout heals itself the next time it is opened,
   without a destructive rewrite of what is stored.

   Only the keys listed here are touched; everything the admin chose
   deliberately is left exactly as it is.
   ------------------------------------------------------------------ */
const NATIVE_DEFAULT_LIMIT = {
    featured: 8,
    categories: 4,
    deals: 4,
    topRated: 4,
    recent: 8,
    testimonials: 3,
    benefits: 4,
    newsletter: 1,
};

const migrateProfile = (profile) => {
    if (!profile || !Array.isArray(profile.blocks)) return profile;

    let touched = false;

    const blocks = profile.blocks.map((block) => {
        const natural = NATIVE_DEFAULT_LIMIT[block?.type];
        if (natural === undefined) return block;

        const next = { ...block };

        /* 8 was the old one-size-fits-all default, so a block still holding
           exactly that never had a deliberate choice made for it. Any other
           number was set on purpose and survives. */
        if (block.props?.limit === 8 && natural !== 8) {
            next.props = { ...block.props, limit: natural };
            touched = true;
        }

        /* Size and spacing belong to the section itself; the controls for
           them are gone, so a leftover value could never be cleared by
           hand. `padding` is dropped rather than deleted outright because
           the resolver reads it for custom blocks — resetting it to the
           neutral default is enough. */
        if (block.style?.minHeight || block.style?.maxWidth) {
            const { minHeight, maxWidth, ...rest } = block.style;
            next.style = rest;
            touched = true;
        }

        return next;
    });

    return touched ? { ...profile, blocks } : profile;
};

export const listProfiles = async () => {
    try {
        const rows = await tx('readonly', (store) => ask(store.getAll()));
        return rows
            .map(migrateProfile)
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } catch (error) {
        console.error('Failed to list layout profiles:', error);
        return [];
    }
};

export const getProfile = async (id) => {
    if (!id) return null;

    try {
        const row = await tx('readonly', (store) => ask(store.get(id)));
        return row ? migrateProfile(row) : null;
    } catch (error) {
        console.error('Failed to read a layout profile:', error);
        return null;
    }
};

/* ------------------------------ writes ---------------------------- */

export const saveProfile = async (profile) => {
    const record = { ...profile, updatedAt: new Date().toISOString() };
    await tx('readwrite', (store) => store.put(record));
    return record;
};

export const deleteProfile = async (id) => {
    await tx('readwrite', (store) => store.delete(id));
};

/* --------------------------- templates ---------------------------- */

export const listTemplates = async () => {
    try {
        const rows = await tx('readonly', (store) => ask(store.getAll()), TEMPLATE_STORE);
        return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        console.error('Failed to list templates:', error);
        return [];
    }
};

export const saveTemplate = async (template) => {
    const record = {
        id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        ...template,
    };
    await tx('readwrite', (store) => store.put(record), TEMPLATE_STORE);
    return record;
};

export const deleteTemplate = async (id) => {
    await tx('readwrite', (store) => store.delete(id), TEMPLATE_STORE);
};

/* ------------------------- active selection ----------------------- */

export const readActiveId = () => {
    try {
        return localStorage.getItem(ACTIVE_KEY) || '';
    } catch {
        return '';
    }
};

export const writeActiveId = (id) => {
    try {
        if (id) localStorage.setItem(ACTIVE_KEY, id);
        else localStorage.removeItem(ACTIVE_KEY);
        return true;
    } catch (error) {
        console.error('Failed to record the active layout:', error);
        return false;
    }
};

/* ---------------------------- scheduling -------------------------- */

/* Whether a profile's window is open right now.

   An empty bound means "no bound", so a start-only schedule runs
   forever once it opens. Times are read as local, which is what an
   admin picking a date in their own timezone expects. */
export const isScheduleOpen = (profile, now = Date.now()) => {
    const schedule = profile?.schedule;
    if (!schedule?.enabled) return true;

    if (schedule.startsAt) {
        const start = new Date(schedule.startsAt).getTime();
        if (Number.isFinite(start) && now < start) return false;
    }

    if (schedule.endsAt) {
        const end = new Date(schedule.endsAt).getTime();
        if (Number.isFinite(end) && now > end) return false;
    }

    return true;
};

export const scheduleState = (profile, now = Date.now()) => {
    const schedule = profile?.schedule;
    if (!schedule?.enabled) return { state: 'always', label: 'Always on' };

    const start = schedule.startsAt ? new Date(schedule.startsAt).getTime() : null;
    const end = schedule.endsAt ? new Date(schedule.endsAt).getTime() : null;

    if (start && now < start) return { state: 'pending', label: 'Scheduled', at: start };
    if (end && now > end) return { state: 'expired', label: 'Ended', at: end };
    return { state: 'running', label: 'Running now', until: end };
};

/* ------------------------------- A/B ------------------------------ */

/* A visitor keeps the same bucket for the life of the browser, per
   experiment. Re-rolling on every page load would make the test
   meaningless and the experience jarring. */
export const readBucket = (experimentId) => {
    try {
        const raw = localStorage.getItem(BUCKET_KEY);
        const map = raw ? JSON.parse(raw) : {};
        return map && typeof map === 'object' ? map[experimentId] || '' : '';
    } catch {
        return '';
    }
};

export const writeBucket = (experimentId, value) => {
    try {
        const raw = localStorage.getItem(BUCKET_KEY);
        const map = raw ? JSON.parse(raw) : {};
        const next = map && typeof map === 'object' ? map : {};
        next[experimentId] = value;
        localStorage.setItem(BUCKET_KEY, JSON.stringify(next));
    } catch (error) {
        console.error('Failed to record the A/B bucket:', error);
    }
};

/* Returns 'a' or 'b'. Sticky once assigned. */
export const assignBucket = (experimentId, split = 50) => {
    const existing = readBucket(experimentId);
    if (existing === 'a' || existing === 'b') return existing;

    const bucket = Math.random() * 100 < split ? 'a' : 'b';
    writeBucket(experimentId, bucket);
    return bucket;
};

export const clearBuckets = () => {
    try {
        localStorage.removeItem(BUCKET_KEY);
    } catch (error) {
        console.error('Failed to clear A/B buckets:', error);
    }
};

/* --------------------------- portability -------------------------- */

export const exportProfile = (profile) =>
    JSON.stringify({ kind: 'shopstream-layout', version: 2, profile }, null, 2);

export const importProfile = (text) => {
    const parsed = JSON.parse(text);

    if (parsed?.kind !== 'shopstream-layout' || !parsed.profile) {
        throw new Error('That file is not a ShopStream layout.');
    }

    if (!Array.isArray(parsed.profile.blocks)) {
        throw new Error('That layout has no blocks.');
    }

    const base = emptyProfile(parsed.profile.name || 'Imported', parsed.profile.kind || 'home');

    /* Merge onto a fresh profile so a v1 export gains the fields added
       later instead of arriving half-formed. A new id prevents an import
       from silently overwriting the profile it came from, and an
       imported page starts offline so it cannot appear unannounced. */
    return {
        ...base,
        ...parsed.profile,
        id: base.id,
        name: `${parsed.profile.name || 'Imported'} (imported)`,
        slug: parsed.profile.slug ? `${parsed.profile.slug}-copy` : base.slug,
        live: false,
        showInNav: false,
        schedule: { ...base.schedule, ...(parsed.profile.schedule || {}) },
        ab: { ...base.ab, ...(parsed.profile.ab || {}) },
        seo: { ...base.seo, ...(parsed.profile.seo || {}) },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
};

export default {
    listProfiles,
    getProfile,
    saveProfile,
    deleteProfile,
    listTemplates,
    saveTemplate,
    deleteTemplate,
    readActiveId,
    writeActiveId,
    emptyProfile,
    exportProfile,
    importProfile,
    isScheduleOpen,
    scheduleState,
    assignBucket,
    slugify,
};
