import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNotification } from '../components/Notification.jsx';

const WishlistContext = createContext();

/* Shared with CartPage so the "Saved Items" panel reads the same list.
   This is what closes the loop: HomePage writes, CartPage reads. */
export const SAVED_ITEMS_KEY = 'shopstream_saved_items';
export const RECENTLY_VIEWED_KEY = 'shopstream_recently_viewed';
const MAX_RECENT = 8;

const readList = (key) => {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error(`Failed to read ${key}:`, error);
        return [];
    }
};

const writeList = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Failed to write ${key}:`, error);
    }
};

/* Keep only what the cards actually render. */
const slim = (product) => ({
    id: product.id,
    title: product.title,
    price: Number(product.price || 0),
    thumbnail: product.thumbnail || product.images?.[0] || '',
    brand: product.brand || '',
    category: product.category || '',
    rating: product.rating ?? 0,
    stock: product.stock ?? 0,
    discountPercentage: product.discountPercentage ?? 0,
});

export const WishlistProvider = ({ children }) => {
    const { notify } = useNotification();

    const [wishlist, setWishlist] = useState(() => readList(SAVED_ITEMS_KEY));
    const [recentlyViewed, setRecentlyViewed] = useState(() => readList(RECENTLY_VIEWED_KEY));

    /* Stay in sync when another tab changes either list. */
    useEffect(() => {
        const sync = (event) => {
            if (event.key === SAVED_ITEMS_KEY) setWishlist(readList(SAVED_ITEMS_KEY));
            if (event.key === RECENTLY_VIEWED_KEY) setRecentlyViewed(readList(RECENTLY_VIEWED_KEY));
        };

        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);

    const isWishlisted = useCallback(
        (productId) => wishlist.some((item) => item.id === productId),
        [wishlist]
    );

    const toggleWishlist = useCallback(
        (product) => {
            if (!product?.id) return false;

            let added = false;

            setWishlist((previous) => {
                const exists = previous.some((item) => item.id === product.id);
                const next = exists
                    ? previous.filter((item) => item.id !== product.id)
                    : [slim(product), ...previous];

                added = !exists;
                writeList(SAVED_ITEMS_KEY, next);
                return next;
            });

            notify.info(
                added
                    ? `${product.title} saved to your wishlist.`
                    : `${product.title} removed from your wishlist.`
            );

            return added;
        },
        [notify]
    );

    const removeFromWishlist = useCallback((productId) => {
        setWishlist((previous) => {
            const next = previous.filter((item) => item.id !== productId);
            writeList(SAVED_ITEMS_KEY, next);
            return next;
        });
    }, []);

    const clearWishlist = useCallback(() => {
        setWishlist([]);
        writeList(SAVED_ITEMS_KEY, []);
    }, []);

    /* Most recent first, no duplicates, capped. */
    const trackView = useCallback((product) => {
        if (!product?.id) return;

        setRecentlyViewed((previous) => {
            const next = [slim(product), ...previous.filter((item) => item.id !== product.id)].slice(
                0,
                MAX_RECENT
            );
            writeList(RECENTLY_VIEWED_KEY, next);
            return next;
        });
    }, []);

    const clearRecentlyViewed = useCallback(() => {
        setRecentlyViewed([]);
        writeList(RECENTLY_VIEWED_KEY, []);
    }, []);

    const value = useMemo(
        () => ({
            wishlist,
            wishlistCount: wishlist.length,
            isWishlisted,
            toggleWishlist,
            removeFromWishlist,
            clearWishlist,
            recentlyViewed,
            trackView,
            clearRecentlyViewed,
        }),
        [
            wishlist,
            isWishlisted,
            toggleWishlist,
            removeFromWishlist,
            clearWishlist,
            recentlyViewed,
            trackView,
            clearRecentlyViewed,
        ]
    );

    return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
};

export const useWishlist = () => {
    const context = useContext(WishlistContext);

    if (!context) {
        throw new Error('useWishlist must be used inside <WishlistProvider>.');
    }

    return context;
};

export default WishlistContext;
