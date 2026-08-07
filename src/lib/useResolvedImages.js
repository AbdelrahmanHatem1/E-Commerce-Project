import { useEffect, useState } from 'react';
import { resolveImage, resolveImages, isImageRef } from './imageStore.js';

/* ----------------------------------------------------------------
   Turn stored references into displayable URLs.

   An `idb:` reference means nothing to an <img> tag, so anything that
   renders admin-uploaded images has to resolve it first. Plain http
   URLs and legacy data URLs pass through unchanged, which keeps every
   call site free of special-casing.
   ---------------------------------------------------------------- */

export const useResolvedImage = (ref) => {
    /* Non-refs resolve synchronously so there is no blank first paint
       for the 99% of products still using API URLs. */
    const [url, setUrl] = useState(() => (isImageRef(ref) ? '' : ref || ''));

    useEffect(() => {
        if (!isImageRef(ref)) {
            setUrl(ref || '');
            return undefined;
        }

        let cancelled = false;

        resolveImage(ref).then((resolved) => {
            if (!cancelled) setUrl(resolved);
        });

        return () => {
            cancelled = true;
        };
    }, [ref]);

    return url;
};

export const useResolvedImages = (refs) => {
    const key = Array.isArray(refs) ? refs.join('|') : '';

    const [urls, setUrls] = useState(() =>
        (refs || []).map((ref) => (isImageRef(ref) ? '' : ref || ''))
    );

    useEffect(() => {
        const list = refs || [];

        if (!list.some(isImageRef)) {
            setUrls(list);
            return undefined;
        }

        let cancelled = false;

        resolveImages(list).then((resolved) => {
            if (!cancelled) setUrls(resolved);
        });

        return () => {
            cancelled = true;
        };
        /* Keyed on the joined list: the array identity changes on every
           render but its contents rarely do. */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return urls;
};

export default useResolvedImage;
