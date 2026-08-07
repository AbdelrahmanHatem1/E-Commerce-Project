import React from 'react';
import { useResolvedImage } from '../lib/useResolvedImages.js';
import './StoredImage.css';

/* ----------------------------------------------------------------
   A drop-in <img> that understands `idb:` references.

   Admin-uploaded photos live as Blobs in IndexedDB, so a product's
   `thumbnail` may be a reference rather than a URL. Twenty-two places
   render product images; wrapping them all in a hook would mean
   twenty-two edits and twenty-two chances to forget one. This keeps
   the change to a single import per file.

   Anything that is already a URL renders immediately with no extra
   work, so the common path is unaffected.
   ---------------------------------------------------------------- */
const StoredImage = ({ src, alt = '', ...rest }) => {
    const resolved = useResolvedImage(src);

    /* An empty src makes the browser re-request the current page, so
       hold the element back until there is something real to show. */
    if (!resolved) return <span className="si-placeholder" aria-hidden="true" />;

    return <img src={resolved} alt={alt} {...rest} />;
};

export default StoredImage;
