import React from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { slugify, scheduleState } from '../../../lib/layoutStore.js';

/* ----------------------------------------------------------------
   Everything about the layout as a whole, rather than one block:
   where it lives, when it runs, and whether it is half of an A/B test.

   Kept out of the block inspector because these settings apply once
   per layout — mixing them into a panel that changes with the
   selection would make them feel like block properties.
   ---------------------------------------------------------------- */
const PageSettings = ({ draft, profiles, slugConflict, onChange, onClose }) => {
    const isPage = draft.kind === 'page';
    const conflict = isPage && draft.slug && slugConflict(draft.slug, draft.id);
    const state = scheduleState(draft);

    /* Only other saved layouts can be the B variant, and a layout cannot
       test against itself. */
    const variantOptions = profiles.filter((p) => p.id !== draft.id && p.kind === draft.kind);
    const variant = profiles.find((p) => p.id === draft.ab?.variantId);

    const patchSchedule = (patch) =>
        onChange({ schedule: { ...draft.schedule, ...patch } });

    const patchAb = (patch) => onChange({ ab: { ...draft.ab, ...patch } });
    const patchSeo = (patch) => onChange({ seo: { ...draft.seo, ...patch } });

    return (
        <aside className="ps" aria-label="Layout settings">
            <header className="ps-head">
                <div>
                    <strong>Layout settings</strong>
                    <small>Applies to the whole {isPage ? 'page' : 'home page'}</small>
                </div>
                <button type="button" onClick={onClose} aria-label="Close settings">
                    <i className="bi bi-x-lg" aria-hidden="true" />
                </button>
            </header>

            <div className="ps-body">
                {/* ---------------------------- type ---------------------------- */}
                <section className="ps-group">
                    <h3>What is this?</h3>

                    <div className="ps-seg">
                        <button
                            type="button"
                            className={!isPage ? 'is-on' : ''}
                            onClick={() => onChange({ kind: 'home' })}
                        >
                            <i className="bi bi-house" aria-hidden="true" />
                            Home page
                        </button>
                        <button
                            type="button"
                            className={isPage ? 'is-on' : ''}
                            onClick={() =>
                                onChange({
                                    kind: 'page',
                                    slug: draft.slug || slugify(draft.name) || 'new-page',
                                })
                            }
                        >
                            <i className="bi bi-file-earmark" aria-hidden="true" />
                            Standalone page
                        </button>
                    </div>

                    <p className="ps-hint">
                        {isPage
                            ? 'Gets its own address and can appear in the navigation bar.'
                            : 'Replaces the storefront home page when you publish it.'}
                    </p>
                </section>

                {/* --------------------------- address -------------------------- */}
                {isPage && (
                    <section className="ps-group">
                        <h3>Address</h3>

                        <div className="ps-field">
                            <label htmlFor="ps-slug">URL</label>
                            <div className={`ps-slug ${conflict ? 'is-bad' : ''}`}>
                                <span>/p/</span>
                                <input
                                    id="ps-slug"
                                    value={draft.slug}
                                    onChange={(e) => onChange({ slug: slugify(e.target.value) })}
                                    placeholder="winter-sale"
                                />
                            </div>
                            {conflict ? (
                                <span className="ps-error">
                                    <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
                                    Another page already uses this address.
                                </span>
                            ) : (
                                <span className="ps-hint">
                                    Letters, numbers and dashes. Spaces become dashes automatically.
                                </span>
                            )}
                        </div>

                        <div className="ps-toggle">
                            <div>
                                <strong>Show in the navigation bar</strong>
                                <small>Appears after Support, up to four pages.</small>
                            </div>
                            <button
                                type="button"
                                className={`am-switch is-green ${draft.showInNav ? 'is-on' : ''}`}
                                onClick={() => onChange({ showInNav: !draft.showInNav })}
                                role="switch"
                                aria-checked={Boolean(draft.showInNav)}
                                aria-label="Show in navigation"
                            >
                                <span />
                            </button>
                        </div>

                        {draft.showInNav && (
                            <div className="ps-field">
                                <label htmlFor="ps-navlabel">Menu label</label>
                                <input
                                    id="ps-navlabel"
                                    value={draft.navLabel || ''}
                                    onChange={(e) => onChange({ navLabel: e.target.value })}
                                    placeholder={draft.name}
                                />
                            </div>
                        )}

                        <div className="ps-toggle">
                            <div>
                                <strong>Live</strong>
                                <small>
                                    {draft.live
                                        ? 'Anyone with the link can open it.'
                                        : 'Only you can see it while it is off.'}
                                </small>
                            </div>
                            <button
                                type="button"
                                className={`am-switch is-green ${draft.live ? 'is-on' : ''}`}
                                onClick={() => onChange({ live: !draft.live })}
                                role="switch"
                                aria-checked={Boolean(draft.live)}
                                aria-label="Live"
                                disabled={conflict}
                            >
                                <span />
                            </button>
                        </div>
                    </section>
                )}

                {/* -------------------------- schedule -------------------------- */}
                <section className="ps-group">
                    <h3>
                        Schedule
                        <span className={`ps-state is-${state.state}`}>{state.label}</span>
                    </h3>

                    <div className="ps-toggle">
                        <div>
                            <strong>Run between dates</strong>
                            <small>Outside the window the built-in layout is used.</small>
                        </div>
                        <button
                            type="button"
                            className={`am-switch is-green ${draft.schedule?.enabled ? 'is-on' : ''}`}
                            onClick={() => patchSchedule({ enabled: !draft.schedule?.enabled })}
                            role="switch"
                            aria-checked={Boolean(draft.schedule?.enabled)}
                            aria-label="Enable schedule"
                        >
                            <span />
                        </button>
                    </div>

                    {draft.schedule?.enabled && (
                        <>
                            <div className="ps-field">
                                <label htmlFor="ps-start">Starts</label>
                                <input
                                    id="ps-start"
                                    type="datetime-local"
                                    value={draft.schedule.startsAt || ''}
                                    onChange={(e) => patchSchedule({ startsAt: e.target.value })}
                                />
                            </div>

                            <div className="ps-field">
                                <label htmlFor="ps-end">Ends</label>
                                <input
                                    id="ps-end"
                                    type="datetime-local"
                                    value={draft.schedule.endsAt || ''}
                                    onChange={(e) => patchSchedule({ endsAt: e.target.value })}
                                />
                            </div>

                            {draft.schedule.startsAt &&
                                draft.schedule.endsAt &&
                                new Date(draft.schedule.endsAt) <= new Date(draft.schedule.startsAt) && (
                                    <span className="ps-error">
                                        <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
                                        The end date is before the start, so this will never run.
                                    </span>
                                )}

                            <p className="ps-hint">
                                Leave either field empty for an open-ended window. Times are read in your
                                own timezone.
                            </p>
                        </>
                    )}
                </section>

                {/* ----------------------------- A/B ---------------------------- */}
                <section className="ps-group">
                    <h3>A/B test</h3>

                    <div className="ps-toggle">
                        <div>
                            <strong>Split traffic</strong>
                            <small>Show a second layout to some visitors.</small>
                        </div>
                        <button
                            type="button"
                            className={`am-switch is-green ${draft.ab?.enabled ? 'is-on' : ''}`}
                            onClick={() => patchAb({ enabled: !draft.ab?.enabled })}
                            role="switch"
                            aria-checked={Boolean(draft.ab?.enabled)}
                            aria-label="Enable A/B test"
                            disabled={variantOptions.length === 0}
                        >
                            <span />
                        </button>
                    </div>

                    {variantOptions.length === 0 ? (
                        <p className="ps-hint">
                            Save a second layout first — a test needs something to compare against.
                        </p>
                    ) : (
                        draft.ab?.enabled && (
                            <>
                                <div className="ps-field">
                                    <label htmlFor="ps-variant">Variant B</label>
                                    <select
                                        id="ps-variant"
                                        value={draft.ab.variantId || ''}
                                        onChange={(e) => patchAb({ variantId: e.target.value })}
                                    >
                                        <option value="">Choose a layout…</option>
                                        {variantOptions.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="ps-field">
                                    <label htmlFor="ps-split">
                                        Traffic to A
                                        <span className="ps-value">{draft.ab.split ?? 50}%</span>
                                    </label>
                                    <input
                                        id="ps-split"
                                        type="range"
                                        min="10"
                                        max="90"
                                        step="5"
                                        value={draft.ab.split ?? 50}
                                        onChange={(e) => patchAb({ split: Number(e.target.value) })}
                                    />
                                    <div className="ps-split">
                                        <span style={{ width: `${draft.ab.split ?? 50}%` }}>
                                            A · {draft.name}
                                        </span>
                                        <span>B · {variant?.name || 'not chosen'}</span>
                                    </div>
                                </div>

                                <div className="am-notice is-info">
                                    <i className="bi bi-info-circle" aria-hidden="true" />
                                    A visitor keeps the same side for the life of their browser, so the
                                    experience never flips mid-session.
                                </div>
                            </>
                        )
                    )}
                </section>

                {/* ----------------------------- SEO ---------------------------- */}
                <section className="ps-group">
                    <h3>Search &amp; sharing</h3>

                    <div className="ps-field">
                        <label htmlFor="ps-title">Page title</label>
                        <input
                            id="ps-title"
                            value={draft.seo?.title || ''}
                            onChange={(e) => patchSeo({ title: e.target.value })}
                            placeholder={draft.name}
                            maxLength={70}
                        />
                        <span className="ps-hint">{(draft.seo?.title || '').length}/70</span>
                    </div>

                    <div className="ps-field">
                        <label htmlFor="ps-desc">Description</label>
                        <textarea
                            id="ps-desc"
                            rows={3}
                            value={draft.seo?.description || ''}
                            onChange={(e) => patchSeo({ description: e.target.value })}
                            placeholder="One or two sentences for search results."
                            maxLength={160}
                        />
                        <span className="ps-hint">{(draft.seo?.description || '').length}/160</span>
                    </div>
                </section>
            </div>
        </aside>
    );
};

export default PageSettings;
