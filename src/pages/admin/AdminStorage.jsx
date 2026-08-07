import React, { useCallback, useEffect, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { usageReport, quotaEstimate, formatBytes } from '../../lib/storage.js';
import { imageStoreSize, listImageIds, collectGarbage, idbAvailable } from '../../lib/imageStore.js';
import { useAdmin } from '../../contexts/AdminContext.jsx';
import { isImageRef } from '../../lib/imageStore.js';
import { ConfirmDialog } from './AdminModal.jsx';
import { useNotification } from '../../components/Notification.jsx';
import './AdminStorage.css';

const AdminStorage = () => {
    const { created, overrides, changeBreakdown, resetAdminData } = useAdmin();
    const { notify } = useNotification();

    const [local, setLocal] = useState(() => usageReport());
    const [images, setImages] = useState({ count: 0, bytes: 0 });
    const [estimate, setEstimate] = useState({ supported: false, usage: 0, quota: 0 });
    const [confirmReset, setConfirmReset] = useState(false);
    const [sweeping, setSweeping] = useState(false);

    const refresh = useCallback(async () => {
        setLocal(usageReport());
        setEstimate(await quotaEstimate());

        if (idbAvailable()) {
            const [bytes, ids] = await Promise.all([imageStoreSize(), listImageIds()]);
            setImages({ count: ids.length, bytes });
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh, created, overrides]);

    /* Manual sweep — the automatic one is debounced and only fires after
       an edit, so a panel visit is a good moment to force it. */
    const sweep = async () => {
        setSweeping(true);

        const referenced = [
            ...created.flatMap((product) => [product.thumbnail, ...(product.images || [])]),
            ...Object.values(overrides).flatMap((patch) => [patch.thumbnail, ...(patch.images || [])]),
        ].filter(isImageRef);

        try {
            const removed = await collectGarbage(referenced);
            await refresh();
            notify.success(
                removed ? `Freed ${removed} orphaned image${removed === 1 ? '' : 's'}.` : 'Nothing to clean.'
            );
        } catch (error) {
            console.error('Sweep failed:', error);
            notify.error('Cleanup failed', 'Could not reach IndexedDB.');
        } finally {
            setSweeping(false);
        }
    };

    const tone = local.percent > 85 ? 'bad' : local.percent > 60 ? 'warn' : 'ok';

    return (
        <div className="st-page">
            <header className="st-header">
                <div>
                    <h1>Storage</h1>
                    <p>Where this device keeps your admin changes.</p>
                </div>

                <div className="st-header-tools">
                    <button type="button" className="st-tool" onClick={refresh}>
                        <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                        Refresh
                    </button>
                    <button type="button" className="st-tool" onClick={sweep} disabled={sweeping}>
                        <i className="bi bi-recycle" aria-hidden="true" />
                        {sweeping ? 'Cleaning…' : 'Clean orphans'}
                    </button>
                </div>
            </header>

            {/* ------------------------- the two stores ------------------------ */}
            <div className="st-grid">
                <section className={`st-card is-${tone}`}>
                    <header>
                        <span className="st-card-icon is-amber" aria-hidden="true">
                            <i className="bi bi-hdd" />
                        </span>
                        <div>
                            <h2>localStorage</h2>
                            <small>Text records — settings, orders, edits</small>
                        </div>
                    </header>

                    <div className="st-bar" role="img" aria-label={`${local.percent.toFixed(0)}% used`}>
                        <span className={`st-bar-fill is-${tone}`} style={{ width: `${local.percent}%` }} />
                    </div>

                    <p className="st-usage">
                        <strong>{formatBytes(local.total)}</strong> of about{' '}
                        {formatBytes(local.quota)} · {local.percent.toFixed(1)}%
                    </p>

                    <p className="st-note">
                        Quota is counted in UTF-16 code units, so every character costs two bytes. That is
                        why base64 images were so expensive here.
                    </p>
                </section>

                <section className="st-card is-ok">
                    <header>
                        <span className="st-card-icon is-violet" aria-hidden="true">
                            <i className="bi bi-images" />
                        </span>
                        <div>
                            <h2>IndexedDB</h2>
                            <small>Uploaded photos, stored as binary</small>
                        </div>
                    </header>

                    {idbAvailable() ? (
                        <>
                            <p className="st-big">
                                <strong>{images.count}</strong>
                                <span>image{images.count === 1 ? '' : 's'}</span>
                            </p>

                            <p className="st-usage">
                                <strong>{formatBytes(images.bytes)}</strong> stored as Blobs
                            </p>

                            <p className="st-note">
                                The same photos in localStorage would have cost about{' '}
                                <strong>{formatBytes(Math.round(images.bytes * 2.67))}</strong> — base64 adds a
                                third, then UTF-16 doubles it.
                            </p>
                        </>
                    ) : (
                        <p className="st-note is-bad">
                            IndexedDB is unavailable in this browser, so image uploads are disabled.
                        </p>
                    )}
                </section>
            </div>

            {/* --------------------------- breakdown --------------------------- */}
            <section className="st-panel">
                <h2>What is taking up localStorage</h2>

                {local.entries.length === 0 ? (
                    <p className="st-empty">Nothing stored yet.</p>
                ) : (
                    <ul className="st-list">
                        {local.entries.map((entry) => (
                            <li key={entry.key}>
                                <span className="st-list-label">{entry.label}</span>

                                <span className="st-list-bar" aria-hidden="true">
                                    <span
                                        style={{
                                            width: `${local.total ? (entry.size / local.total) * 100 : 0}%`,
                                        }}
                                    />
                                </span>

                                <span className="st-list-size">{formatBytes(entry.size)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* ------------------------- browser estimate ---------------------- */}
            {estimate.supported && (
                <section className="st-panel">
                    <h2>Browser estimate</h2>
                    <p className="st-note">
                        The browser reports <strong>{formatBytes(estimate.usage)}</strong> used of{' '}
                        <strong>{formatBytes(estimate.quota)}</strong> available to this origin — that figure
                        covers IndexedDB, caches and localStorage together.
                    </p>

                    <div className="st-bar">
                        <span
                            className="st-bar-fill is-ok"
                            style={{
                                width: `${estimate.quota ? Math.min(100, (estimate.usage / estimate.quota) * 100) : 0}%`,
                            }}
                        />
                    </div>
                </section>
            )}

            {/* ----------------------------- danger ---------------------------- */}
            <section className="st-panel is-danger">
                <h2>Reset everything</h2>
                <p className="st-note">
                    Removes {changeBreakdown.edited} product edit
                    {changeBreakdown.edited === 1 ? '' : 's'}, {changeBreakdown.created} created product
                    {changeBreakdown.created === 1 ? '' : 's'}, {changeBreakdown.deleted} archived and{' '}
                    {changeBreakdown.orders} order decision
                    {changeBreakdown.orders === 1 ? '' : 's'}. Uploaded images are deleted with them.
                </p>

                <button type="button" className="st-danger-btn" onClick={() => setConfirmReset(true)}>
                    <i className="bi bi-trash3" aria-hidden="true" />
                    Reset admin data
                </button>
            </section>

            <ConfirmDialog
                open={confirmReset}
                onClose={() => setConfirmReset(false)}
                onConfirm={async () => {
                    resetAdminData();
                    /* Nothing references the blobs once the records are gone. */
                    await collectGarbage([]);
                    await refresh();
                    setConfirmReset(false);
                }}
                title="Reset all admin data?"
                message="Every local edit, created product and uploaded image will be removed from this device. The catalogue returns to the original API data."
                confirmLabel="Reset everything"
                cancelLabel="Keep my changes"
                footnote="Only affects this browser"
            />
        </div>
    );
};

export default AdminStorage;
