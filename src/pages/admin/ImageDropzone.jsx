import React, { useCallback, useEffect, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { putImage, deleteImage, isImageRef, idbAvailable } from '../../lib/imageStore.js';
import { useResolvedImages } from '../../lib/useResolvedImages.js';
import { formatBytes } from '../../lib/storage.js';
import './ImageDropzone.css';

/* ----------------------------------------------------------------
   Product image manager: drag & drop, file picker, URL paste,
   reorder-by-cover and remove.

   Storage
   -------
   Uploads become Blobs in IndexedDB and only a short `idb:<id>`
   reference is kept in the product record. The earlier version wrote
   base64 data URLs straight into localStorage, which cost roughly
   2.7x the file size once base64 inflation and UTF-16 accounting were
   both applied — two photos could exhaust the whole 5 MB budget.
   ---------------------------------------------------------------- */

const MAX_EDGE = 1400;
const QUALITY = 0.82;
const MAX_IMAGES = 8;

/* Blobs are cheap now, so this is a sanity ceiling rather than a
   quota defence: IndexedDB is measured in hundreds of megabytes. */
const BUDGET_BYTES = 12 * 1024 * 1024;

/* Downscale and re-encode, returning a Blob. toBlob is used instead of
   toDataURL so the bytes never become a string at all. */
export const compressImage = (file) =>
    new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error(`${file.name} is not an image.`));
            return;
        }

        const url = URL.createObjectURL(file);
        const image = new Image();

        const cleanup = () => URL.revokeObjectURL(url);

        image.onerror = () => {
            cleanup();
            reject(new Error(`${file.name} is not a valid image.`));
        };

        image.onload = () => {
            const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);

            const ctx = canvas.getContext('2d');
            /* PNG transparency turns black on a JPEG encode, so paint a base first. */
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => {
                    cleanup();
                    if (blob) resolve(blob);
                    else reject(new Error(`Could not encode ${file.name}.`));
                },
                'image/jpeg',
                QUALITY
            );
        };

        /* An object URL avoids reading the whole file into a base64 string
           just to decode it — noticeably lighter on large phone photos. */
        image.src = url;
    });

const ImageDropzone = ({ images = [], onChange, onError, busy = false }) => {
    const [dragging, setDragging] = useState(false);
    const [working, setWorking] = useState(false);
    const [active, setActive] = useState(0);
    const [urlOpen, setUrlOpen] = useState(false);
    const [url, setUrl] = useState('');

    const inputRef = useRef(null);
    const dragDepth = useRef(0);

    /* `images` holds refs; <img> needs URLs. */
    const urls = useResolvedImages(images);

    /* Removing the last image must not leave the hero pointing past the end. */
    useEffect(() => {
        if (active > images.length - 1) setActive(Math.max(0, images.length - 1));
    }, [images.length, active]);

    const report = useCallback(
        (message) => {
            if (onError) onError(message);
            else console.warn(message);
        },
        [onError]
    );

    const addFiles = useCallback(
        async (fileList) => {
            const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
            if (!files.length) return;

            const room = MAX_IMAGES - images.length;

            if (room <= 0) {
                report(`A product can hold ${MAX_IMAGES} images. Remove one first.`);
                return;
            }

            setWorking(true);

            try {
                const accepted = [];
                let total = 0;

                for (const file of files.slice(0, room)) {
                    try {
                        /* Sequential on purpose: decoding eight full-size photos in
                           parallel spikes memory and freezes the tab on mobile. */
                        // eslint-disable-next-line no-await-in-loop
                        const blob = await compressImage(file);

                        if (total + blob.size > BUDGET_BYTES) {
                            report(
                                `Batch limit of ${formatBytes(BUDGET_BYTES)} reached — the rest were skipped.`
                            );
                            break;
                        }

                        /* Store the bytes, keep only the reference. */
                        // eslint-disable-next-line no-await-in-loop
                        const ref = await putImage(blob);

                        total += blob.size;
                        accepted.push(ref);
                    } catch (error) {
                        console.error('Image upload failed:', error);
                        report(error.message || 'That image could not be saved.');
                    }
                }

                if (accepted.length) {
                    onChange([...images, ...accepted]);
                    setActive(images.length);
                }

                if (files.length > room) {
                    report(`Only ${room} more image${room === 1 ? '' : 's'} fit on this product.`);
                }
            } finally {
                setWorking(false);
            }
        },
        [images, onChange, report]
    );

    const handleDrop = (event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (busy) return;
        addFiles(event.dataTransfer.files);
    };

    /* dragenter/dragleave fire for every child, so depth-count them. */
    const handleDragEnter = (event) => {
        event.preventDefault();
        dragDepth.current += 1;
        if (dragDepth.current === 1) setDragging(true);
    };

    const handleDragLeave = (event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
    };

    const removeAt = (index) => {
        const ref = images[index];
        onChange(images.filter((_, i) => i !== index));

        /* Dropping the reference alone would orphan the blob forever. */
        if (isImageRef(ref)) {
            deleteImage(ref).catch((error) =>
                console.error('Failed to delete the stored image:', error)
            );
        }
    };

    const makeCover = (index) => {
        if (index === 0) return;
        const next = [...images];
        const [moved] = next.splice(index, 1);
        next.unshift(moved);
        onChange(next);
        setActive(0);
    };

    const addUrl = (event) => {
        event.preventDefault();
        const value = url.trim();

        if (!/^https?:\/\//i.test(value)) {
            report('Enter a full image URL starting with http:// or https://');
            return;
        }

        if (images.length >= MAX_IMAGES) {
            report(`A product can hold ${MAX_IMAGES} images.`);
            return;
        }

        onChange([...images, value]);
        setActive(images.length);
        setUrl('');
        setUrlOpen(false);
    };

    const disabled = busy || working;
    const hero = urls[active];

    return (
        <div
            className={`dz ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-busy' : ''}`}
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
        >
            <div className="dz-head">
                <span className="dz-title">Product images</span>
                <span className="dz-count">
                    {images.length}/{MAX_IMAGES}
                </span>
            </div>

            {hero ? (
                <div className="dz-hero">
                    <img src={hero} alt={`Product image ${active + 1}`} />

                    <div className="dz-hero-tools">
                        {active !== 0 && (
                            <button type="button" onClick={() => makeCover(active)} disabled={disabled}>
                                <i className="bi bi-star" aria-hidden="true" />
                                Make cover
                            </button>
                        )}

                        <button
                            type="button"
                            className="is-danger"
                            onClick={() => removeAt(active)}
                            disabled={disabled}
                        >
                            <i className="bi bi-trash3" aria-hidden="true" />
                            Remove
                        </button>
                    </div>

                    {active === 0 && <span className="dz-cover-tag">Cover</span>}
                </div>
            ) : (
                <button
                    type="button"
                    className="dz-hero is-empty"
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled}
                >
                    <i className="bi bi-images" aria-hidden="true" />
                    <strong>Drag &amp; drop images here</strong>
                    <small>or click to browse — JPG, PNG or WebP</small>
                </button>
            )}

            <div className="dz-grid">
                {images.map((image, index) => (
                    <div
                        key={`${image}-${index}`}
                        className={`dz-thumb ${index === active ? 'is-active' : ''}`}
                    >
                        <button
                            type="button"
                            className="dz-thumb-pick"
                            onClick={() => setActive(index)}
                            aria-label={`Show image ${index + 1}`}
                            aria-pressed={index === active}
                        >
                            <img src={urls[index] || ''} alt="" loading="lazy" />
                        </button>

                        <button
                            type="button"
                            className="dz-thumb-x"
                            onClick={() => removeAt(index)}
                            disabled={disabled}
                            aria-label={`Remove image ${index + 1}`}
                        >
                            <i className="bi bi-x" aria-hidden="true" />
                        </button>

                        {index === 0 && <span className="dz-thumb-tag">Cover</span>}
                    </div>
                ))}

                {images.length < MAX_IMAGES && (
                    <button
                        type="button"
                        className="dz-add"
                        onClick={() => inputRef.current?.click()}
                        disabled={disabled}
                    >
                        {working ? (
                            <span className="dz-spinner" aria-hidden="true" />
                        ) : (
                            <i className="bi bi-camera" aria-hidden="true" />
                        )}
                        {working ? 'Processing…' : 'Add Image'}
                    </button>
                )}
            </div>

            <div className="dz-foot">
                <button type="button" className="dz-link" onClick={() => setUrlOpen((v) => !v)}>
                    <i className={`bi ${urlOpen ? 'bi-x-lg' : 'bi-link-45deg'}`} aria-hidden="true" />
                    {urlOpen ? 'Close' : 'Add from URL'}
                </button>
                <span className="dz-note">
                    Resized to {MAX_EDGE}px, stored on this device
                    {idbAvailable() ? '' : ' (IndexedDB unavailable — uploads disabled)'}.
                </span>
            </div>

            {urlOpen && (
                <div className="dz-url">
                    <input
                        type="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') addUrl(event);
                        }}
                        placeholder="https://cdn.example.com/photo.jpg"
                        aria-label="Image URL"
                    />
                    <button type="button" onClick={addUrl}>
                        Add
                    </button>
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                    addFiles(event.target.files);
                    /* Reset so picking the same file twice still fires a change. */
                    event.target.value = '';
                }}
            />

            {dragging && (
                <div className="dz-veil" aria-hidden="true">
                    <i className="bi bi-cloud-arrow-down" />
                    Drop to upload
                </div>
            )}
        </div>
    );
};

export default ImageDropzone;
