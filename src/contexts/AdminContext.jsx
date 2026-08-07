import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AuthContext } from './AuthContext.jsx';
import { useNotification } from '../components/Notification.jsx';
import { readJson, writeJson } from '../lib/storage.js';
import { collectGarbage, isImageRef } from '../lib/imageStore.js';

const AdminContext = createContext();

const API = 'https://dummyjson.com';

/* DummyJSON accepts POST/PUT/DELETE and returns a correct response, but
   never persists it. These keys hold our own layer on top so an edit
   actually survives a refresh. */
const OVERRIDES_KEY = 'shopstream_admin_overrides';
const DELETED_KEY = 'shopstream_admin_deleted';
const CREATED_KEY = 'shopstream_admin_created';
const DEMO_KEY = 'shopstream_admin_demo';
const CARTS_KEY = 'shopstream_admin_carts';

/* The API ships these roles: 5 admins, 10 moderators, 193 users. */
const ADMIN_ROLES = ['admin', 'moderator'];

/* ----------------------------------------------------------------
   Deterministic cart status.

   The API has no status field, so it is derived from the cart id.
   Using the id (not Math.random) means a cart keeps the same status
   on every render, refresh and page.
   ---------------------------------------------------------------- */
export const CART_STATES = [
    { id: 'pending', label: 'Pending', tone: 'pending', icon: 'bi-hourglass-split' },
    { id: 'completed', label: 'Completed', tone: 'done', icon: 'bi-check2-circle' },
    { id: 'abandoned', label: 'Abandoned', tone: 'abandoned', icon: 'bi-cart-x' },
    { id: 'cancelled', label: 'Cancelled', tone: 'cancelled', icon: 'bi-x-octagon' },
    { id: 'refunded', label: 'Refunded', tone: 'refunded', icon: 'bi-arrow-counterclockwise' },
];

const CART_STATE_MAP = Object.fromEntries(CART_STATES.map((state) => [state.id, state]));

export const cartStatus = (cart) => {
    /* An admin decision always beats the derived value. */
    if (cart?.statusOverride) {
        return CART_STATE_MAP[cart.statusOverride] ?? CART_STATE_MAP.pending;
    }

    const seed = (cart?.id ?? 0) % 10;
    if (seed < 5) return CART_STATE_MAP.completed;
    if (seed < 7) return CART_STATE_MAP.pending;
    return CART_STATE_MAP.abandoned;
};

/* A stable pseudo session length, again seeded from the id. */
export const cartSession = (cart) => {
    const base = ((cart?.id ?? 1) * 37) % 1500 + 180;
    const minutes = Math.floor(base / 60);
    const seconds = base % 60;
    return { seconds: base, label: `${minutes}m ${String(seconds).padStart(2, '0')}s` };
};

export const AdminProvider = ({ children }) => {
    const { user } = useContext(AuthContext);
    const { notify } = useNotification();

    /* A manual switch so the dashboard can be demoed from any account. */
    const [demoMode, setDemoMode] = useState(() => readJson(DEMO_KEY, false));

    const [overrides, setOverrides] = useState(() => readJson(OVERRIDES_KEY, {}));
    const [deleted, setDeleted] = useState(() => readJson(DELETED_KEY, []));
    const [created, setCreated] = useState(() => readJson(CREATED_KEY, []));

    /* Cart id -> { statusOverride, note, updatedAt }. The API has no
       status field at all, so this is the only place a decision lives. */
    const [cartOverrides, setCartOverrides] = useState(() => readJson(CARTS_KEY, {}));

    /* The login payload has no role, so it comes from /auth/me. */
    const [role, setRole] = useState(null);
    const [roleLoading, setRoleLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setRole(null);
            setRoleLoading(false);
            return undefined;
        }

        let cancelled = false;
        const controller = new AbortController();

        const loadRole = async () => {
            setRoleLoading(true);
            const token = user.accessToken || user.token;

            if (!token) {
                setRole('user');
                setRoleLoading(false);
                return;
            }

            try {
                const { data } = await axios.get(`${API}/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                });
                if (!cancelled) setRole(data.role || 'user');
            } catch (error) {
                const aborted =
                    axios.isCancel(error) ||
                    error.code === 'ERR_CANCELED' ||
                    error.name === 'CanceledError';

                if (!aborted && !cancelled) {
                    console.error('Failed to read the account role:', error);
                    setRole('user');
                }
            } finally {
                if (!cancelled) setRoleLoading(false);
            }
        };

        loadRole();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [user]);

    /* Sync across tabs. */
    useEffect(() => {
        const sync = (event) => {
            if (event.key === OVERRIDES_KEY) setOverrides(readJson(OVERRIDES_KEY, {}));
            if (event.key === DELETED_KEY) setDeleted(readJson(DELETED_KEY, []));
            if (event.key === CREATED_KEY) setCreated(readJson(CREATED_KEY, []));
            if (event.key === DEMO_KEY) setDemoMode(readJson(DEMO_KEY, false));
            if (event.key === CARTS_KEY) setCartOverrides(readJson(CARTS_KEY, {}));
        };

        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);

    const hasRole = ADMIN_ROLES.includes(role);
    const isAdmin = Boolean(user) && (hasRole || demoMode);

    const toggleDemoMode = useCallback(
        (value) => {
            setDemoMode(value);
            writeJson(DEMO_KEY, value);
            notify.info(value ? 'Admin mode enabled.' : 'Admin mode disabled.');
        },
        [notify]
    );

    /* ------------------------ product writes ------------------------ */

    /* ----------------------------------------------------------------
       Apply our local layer on top of whatever the API returned.
  
       `scope` decides who is asking:
         'admin' — everything, including products hidden from shoppers.
         'store' — what a customer may actually see. Unpublished rows
                   are dropped here, which is the whole point of the
                   publish toggle.
       ---------------------------------------------------------------- */
    const applyOverrides = useCallback(
        (products, scope = 'admin', options = {}) => {
            const removed = new Set(deleted);

            /* `products` is often already a filtered slice (one category, one
               search). Blindly prepending every locally created product would
               leak a beauty item into the Electronics results, so the caller
               can narrow what gets injected. */
            const { categories = null, includeCreated = true } = options;

            const extras = !includeCreated
                ? []
                : categories
                    ? created.filter((product) => categories.includes(product.category))
                    : created;

            const merged = [...extras, ...products]
                .filter((product) => !removed.has(product.id))
                .map((product) =>
                    overrides[product.id] ? { ...product, ...overrides[product.id] } : product
                );

            /* `published` is undefined for untouched products — only an
               explicit false hides a row, so the default stays visible. */
            return scope === 'store'
                ? merged.filter((product) => product.published !== false)
                : merged;
        },
        [overrides, deleted, created]
    );

    /* A single product, for the details page. Returns null when the
       product was deleted or unpublished so the page can show a proper
       "not available" state instead of stale data. */
    const applyOne = useCallback(
        (product, scope = 'store') => {
            if (!product) return null;
            if (deleted.includes(product.id)) return null;

            const merged = overrides[product.id]
                ? { ...product, ...overrides[product.id] }
                : product;

            if (scope === 'store' && merged.published === false) return null;
            return merged;
        },
        [overrides, deleted]
    );

    /* Locally created products never came from the API, so any page that
       lists them has to pull them from here. */
    const localProducts = useCallback(
        (scope = 'store') =>
            created
                .filter((product) => !deleted.includes(product.id))
                .filter((product) => scope !== 'store' || product.published !== false),
        [created, deleted]
    );

    const updateProduct = useCallback(
        async (id, patch) => {
            /* Optimistic: store locally first so the table updates instantly. */
            const next = { ...overrides, [id]: { ...(overrides[id] || {}), ...patch } };
            const stored = writeJson(OVERRIDES_KEY, next);

            if (stored === 'quota') {
                notify.error(
                    'Storage full',
                    'This device cannot hold more image data. Remove some images or reset the admin changes.'
                );
                return false;
            }

            setOverrides(next);

            try {
                await axios.put(`${API}/products/${id}`, patch);
                notify.success('Product updated.');
                return true;
            } catch (error) {
                console.error('Update failed:', error);
                notify.warning('Saved locally — the demo API did not confirm the change.');
                return false;
            }
        },
        [overrides, notify]
    );

    /* Restore is defined first so delete can offer it as an Undo. */
    const restoreProduct = useCallback(
        (id, silent = false) => {
            setDeleted((current) => {
                const next = current.filter((entry) => entry !== id);
                writeJson(DELETED_KEY, next);
                return next;
            });

            if (!silent) notify.success('Product restored.');
        },
        [notify]
    );

    const deleteProduct = useCallback(
        async (id, title) => {
            /* Functional updates: two quick deletes in a row would otherwise
               both read the same stale `deleted` array and the first id would
               be lost. */
            setDeleted((current) => {
                const next = [...new Set([...current, id])];
                writeJson(DELETED_KEY, next);
                return next;
            });

            const offerUndo = () =>
                notify.action(`${title} deleted.`, {
                    label: 'Undo',
                    type: 'success',
                    duration: 8000,
                    onAction: () => restoreProduct(id, true),
                });

            /* A locally created product never existed on the server. We keep
               its record in `created` so Undo has something to bring back —
               the id stays in `deleted`, which is what actually hides it. */
            if (String(id).startsWith('local-')) {
                offerUndo();
                return true;
            }

            try {
                await axios.delete(`${API}/products/${id}`);
                offerUndo();
                return true;
            } catch (error) {
                console.error('Delete failed:', error);
                notify.action(`${title} removed locally — the demo API did not confirm it.`, {
                    label: 'Undo',
                    type: 'warning',
                    duration: 8000,
                    onAction: () => restoreProduct(id, true),
                });
                return false;
            }
        },
        [notify, restoreProduct]
    );

    /* Permanently drop a locally created product — Archive uses this. */
    const purgeProduct = useCallback((id) => {
        setCreated((current) => {
            const next = current.filter((product) => product.id !== id);
            writeJson(CREATED_KEY, next);
            return next;
        });

        setDeleted((current) => {
            const next = current.filter((entry) => entry !== id);
            writeJson(DELETED_KEY, next);
            return next;
        });
    }, []);

    /* The publish toggle, so the storefront filter has something to read. */
    const setPublished = useCallback(
        async (id, published) => {
            let ok = true;

            setOverrides((current) => {
                const next = { ...current, [id]: { ...(current[id] || {}), published } };
                if (writeJson(OVERRIDES_KEY, next) === 'quota') {
                    ok = false;
                    return current;
                }
                return next;
            });

            if (!ok) {
                notify.error('Storage full', 'Could not save the publish status on this device.');
                return false;
            }

            notify.success(published ? 'Product is now live.' : 'Product hidden from shoppers.');
            return true;
        },
        [notify]
    );

    const createProduct = useCallback(
        async (draft) => {
            const localId = `local-${Date.now()}`;

            /* The uploader hands us an array; a single pasted URL still works. */
            const gallery = (draft.images?.length ? draft.images : [draft.thumbnail]).filter(Boolean);
            const placeholder = 'https://placehold.co/600x600/eef1f6/9aa6bd?text=New';

            const product = {
                id: localId,
                title: draft.title,
                sku: draft.sku || '',
                price: Number(draft.price) || 0,
                stock: Number(draft.stock) || 0,
                category: draft.category || 'misc',
                brand: draft.brand || 'ShopStream',
                description: draft.description || '',
                /* Every API product ships these. Omitting them made locally
                   created products a different shape from the rest of the
                   catalogue, which any consumer indexing into them would hit. */
                tags: draft.tags?.length ? draft.tags : [draft.category || 'misc'],
                minimumOrderQuantity: 1,
                discountPercentage: 0,
                weight: 0,
                dimensions: { width: 0, height: 0, depth: 0 },
                warrantyInformation: 'No warranty',
                shippingInformation: 'Ships in 3-5 business days',
                returnPolicy: '30 days return policy',
                thumbnail: gallery[0] || placeholder,
                images: gallery.length ? gallery : [placeholder],
                rating: 0,
                discountPercentage: 0,
                availabilityStatus: Number(draft.stock) > 0 ? 'In Stock' : 'Out of Stock',
                reviews: [],
                isLocal: true,
            };

            const next = [product, ...created];
            const stored = writeJson(CREATED_KEY, next);

            if (stored === 'quota') {
                notify.error(
                    'Storage full',
                    'This device cannot hold more image data. Remove some images or reset the admin changes.'
                );
                return null;
            }

            setCreated(next);

            try {
                await axios.post(`${API}/products/add`, {
                    title: product.title,
                    price: product.price,
                });
            } catch (error) {
                console.error('Create failed on the API:', error);
            }

            notify.success(`${product.title} added to the catalogue.`);
            return product;
        },
        [created, notify]
    );

    /* ----------------------------------------------------------------
       Free image blobs nobody points at any more.
  
       Deleting a product only drops its record; the Blob it referenced
       would sit in IndexedDB forever without this. Debounced because
       created/overrides change on every keystroke in the edit form.
       ---------------------------------------------------------------- */
    useEffect(() => {
        const timer = setTimeout(() => {
            const referenced = [
                ...created.flatMap((product) => [product.thumbnail, ...(product.images || [])]),
                ...Object.values(overrides).flatMap((patch) => [
                    patch.thumbnail,
                    ...(patch.images || []),
                ]),
            ].filter(isImageRef);

            collectGarbage(referenced).catch((error) =>
                console.error('Image cleanup failed:', error)
            );
        }, 4000);

        return () => clearTimeout(timer);
    }, [created, overrides]);

    /* ------------------------- cart writes -------------------------- */

    /* Merge admin decisions onto the API's carts. Without this the
       status shown was purely derived from the cart id and nothing an
       admin did could ever change it. */
    const applyCartOverrides = useCallback(
        (carts) =>
            carts.map((cart) =>
                cartOverrides[cart.id] ? { ...cart, ...cartOverrides[cart.id] } : cart
            ),
        [cartOverrides]
    );

    const setCartStatus = useCallback(
        (id, status, note) => {
            let ok = true;

            setCartOverrides((current) => {
                const next = {
                    ...current,
                    [id]: {
                        ...(current[id] || {}),
                        statusOverride: status,
                        ...(note === undefined ? {} : { note }),
                        updatedAt: new Date().toISOString(),
                    },
                };

                if (writeJson(CARTS_KEY, next) === 'quota') {
                    ok = false;
                    return current;
                }
                return next;
            });

            if (!ok) {
                notify.error('Storage full', 'Could not save this order status on the device.');
                return false;
            }

            const label = CART_STATE_MAP[status]?.label ?? status;
            notify.success(`Order #CRT-${id} marked ${label.toLowerCase()}.`);
            return true;
        },
        [notify]
    );

    /* Internal notes are admin-only and never shown to a shopper. */
    const setCartNote = useCallback(
        (id, note) => {
            setCartOverrides((current) => {
                const next = {
                    ...current,
                    [id]: { ...(current[id] || {}), note, updatedAt: new Date().toISOString() },
                };
                writeJson(CARTS_KEY, next);
                return next;
            });

            notify.success(note ? 'Note saved.' : 'Note cleared.');
        },
        [notify]
    );

    const clearCartOverride = useCallback(
        (id) => {
            setCartOverrides((current) => {
                const next = { ...current };
                delete next[id];
                writeJson(CARTS_KEY, next);
                return next;
            });

            notify.info(`Order #CRT-${id} reverted to its derived status.`);
        },
        [notify]
    );

    const resetAdminData = useCallback(() => {
        [OVERRIDES_KEY, DELETED_KEY, CREATED_KEY, CARTS_KEY].forEach((key) =>
            localStorage.removeItem(key)
        );
        setOverrides({});
        setDeleted([]);
        setCreated([]);
        setCartOverrides({});
        notify.success('Admin changes reset to the original catalogue.');
    }, [notify]);

    /* What a reset would actually destroy, so the confirmation can spell
       it out instead of saying a vague "are you sure?". */
    const changeBreakdown = useMemo(
        () => ({
            edited: Object.keys(overrides).length,
            deleted: deleted.length,
            created: created.length,
            orders: Object.keys(cartOverrides).length,
            /* Uploaded images are the expensive part — worth calling out. */
            images: [
                ...created.flatMap((product) => product.images || []),
                ...Object.values(overrides).flatMap((patch) => patch.images || []),
            ].filter((image) => typeof image === 'string' && image.startsWith('data:')).length,
        }),
        [overrides, deleted, created, cartOverrides]
    );

    const value = useMemo(
        () => ({
            isAdmin,
            role,
            roleLoading,
            hasRole,
            demoMode,
            toggleDemoMode,
            overrides,
            deleted,
            created,
            applyOverrides,
            applyOne,
            localProducts,
            updateProduct,
            deleteProduct,
            restoreProduct,
            purgeProduct,
            setPublished,
            createProduct,
            cartOverrides,
            applyCartOverrides,
            setCartStatus,
            setCartNote,
            clearCartOverride,
            resetAdminData,
            changeBreakdown,
            pendingChanges:
                Object.keys(overrides).length +
                deleted.length +
                created.length +
                Object.keys(cartOverrides).length,
        }),
        [
            isAdmin,
            role,
            roleLoading,
            hasRole,
            demoMode,
            toggleDemoMode,
            overrides,
            deleted,
            created,
            applyOverrides,
            applyOne,
            localProducts,
            updateProduct,
            deleteProduct,
            restoreProduct,
            purgeProduct,
            setPublished,
            createProduct,
            cartOverrides,
            applyCartOverrides,
            setCartStatus,
            setCartNote,
            clearCartOverride,
            resetAdminData,
            changeBreakdown,
        ]
    );

    return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

export const useAdmin = () => {
    const context = useContext(AdminContext);

    if (!context) {
        throw new Error('useAdmin must be used inside <AdminProvider>.');
    }

    return context;
};

export default AdminContext;
