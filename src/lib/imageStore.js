/* ----------------------------------------------------------------
   Image storage on IndexedDB.

   Why this exists
   ---------------
   Uploaded images used to be written into localStorage as base64 data
   URLs. Three separate costs stack up there:

     1. base64 inflates the payload by  ~33%
     2. JSON keeps it as a string
     3. localStorage measures its quota in UTF-16 code units, so every
        base64 character costs 2 bytes

   A 130 KB photo therefore consumed ~0.34 MB of a ~5 MB budget, and
   the whole admin layer shared that budget with a dozen other keys.

   Storing the same photo as a Blob in IndexedDB costs 130 KB against a
   quota measured in hundreds of megabytes — roughly 2.7x smaller and
   ~100x more headroom.

   localStorage now holds only a short reference string, `idb:<id>`.
   ---------------------------------------------------------------- */

const DB_NAME = 'shopstream';
const DB_VERSION = 1;
const STORE = 'images';

export const IDB_PREFIX = 'idb:';

export const isImageRef = (value) =>
    typeof value === 'string' && value.startsWith(IDB_PREFIX);

/* Object URLs are cached so the same blob is not re-materialised on
   every render, and so they can all be revoked on cleanup. */
const urlCache = new Map();

let dbPromise = null;

export const idbAvailable = () => {
    try {
        return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
        return false;
    }
};

const openDb = () => {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        if (!idbAvailable()) {
            reject(new Error('IndexedDB is not available in this browser.'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);

        /* Another tab holding an older version open would block us
           forever otherwise. */
        request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab.'));
    });

    /* A failed open must not be cached, or every later call fails too. */
    dbPromise.catch(() => {
        dbPromise = null;
    });

    return dbPromise;
};

const tx = async (mode, run) => {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
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

/* Wrap an IDBRequest so it can be awaited inside a transaction. */
const ask = (request) =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

/* ------------------------------ writes ---------------------------- */

export const putImage = async (blob) => {
    const id = `${IDB_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    await tx('readwrite', (store) =>
        store.put({ id, blob, size: blob.size, type: blob.type, at: Date.now() })
    );

    /* Prime the cache — the caller is about to display it. */
    urlCache.set(id, URL.createObjectURL(blob));
    return id;
};

export const deleteImage = async (id) => {
    if (!isImageRef(id)) return;

    const url = urlCache.get(id);
    if (url) {
        URL.revokeObjectURL(url);
        urlCache.delete(id);
    }

    await tx('readwrite', (store) => store.delete(id));
};

/* ------------------------------ reads ----------------------------- */

/* Resolve one reference to something an <img src> accepts. Plain URLs
   and legacy data URLs pass straight through untouched. */
export const resolveImage = async (ref) => {
    if (!isImageRef(ref)) return ref;
    if (urlCache.has(ref)) return urlCache.get(ref);

    try {
        const record = await tx('readonly', (store) => ask(store.get(ref)));
        if (!record?.blob) return '';

        const url = URL.createObjectURL(record.blob);
        urlCache.set(ref, url);
        return url;
    } catch (error) {
        console.error('Failed to read image from IndexedDB:', error);
        return '';
    }
};

export const resolveImages = (refs = []) => Promise.all(refs.map(resolveImage));

export const listImageIds = async () => {
    try {
        return await tx('readonly', (store) => ask(store.getAllKeys()));
    } catch (error) {
        console.error('Failed to list stored images:', error);
        return [];
    }
};

/* Total bytes held, for the storage panel. */
export const imageStoreSize = async () => {
    try {
        const records = await tx('readonly', (store) => ask(store.getAll()));
        return records.reduce((sum, record) => sum + (record.size || 0), 0);
    } catch (error) {
        console.error('Failed to measure the image store:', error);
        return 0;
    }
};

/* ------------------------- garbage collection --------------------- */

/* Anything not referenced by the admin layer any more is dead weight.
   Called after deletes so a removed product does not leak its blobs. */
export const collectGarbage = async (referenced) => {
    const keep = new Set(referenced.filter(isImageRef));
    const stored = await listImageIds();
    const orphans = stored.filter((id) => !keep.has(id));

    await Promise.all(orphans.map(deleteImage));
    return orphans.length;
};

/* Drop every object URL. Safe to call on unload. */
export const releaseUrls = () => {
    urlCache.forEach((url) => URL.revokeObjectURL(url));
    urlCache.clear();
};

/* ------------------------------ helpers --------------------------- */

/* Convert a legacy base64 data URL into a Blob so it can be migrated
   out of localStorage without a network round-trip. */
export const dataUrlToBlob = (dataUrl) => {
    const [header, payload] = dataUrl.split(',');
    const mime = /:(.*?);/.exec(header)?.[1] || 'image/jpeg';
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    return new Blob([bytes], { type: mime });
};

export default {
    putImage,
    deleteImage,
    resolveImage,
    resolveImages,
    imageStoreSize,
    collectGarbage,
    releaseUrls,
    isImageRef,
    idbAvailable,
};
