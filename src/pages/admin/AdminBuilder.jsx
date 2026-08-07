import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { useLayout } from '../../contexts/LayoutContext.jsx';
import { ThemeContext } from '../../contexts/ThemeContext.jsx';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { useNotification } from '../../components/Notification.jsx';
import { THEMES, applyTheme } from './builder/themes.js';
import { scheduleState } from '../../lib/layoutStore.js';
import { applyPreset, presetBlockCount } from './builder/presets.js';
import BlockPalette from './builder/BlockPalette.jsx';
import VisualCanvas, { DEVICES } from './builder/VisualCanvas.jsx';
import BuilderCanvas from './builder/BuilderCanvas.jsx';
import BlockInspector from './builder/BlockInspector.jsx';
import PageSettings from './builder/PageSettings.jsx';
import AdminModal, { ConfirmDialog } from './AdminModal.jsx';
import './builder/visualCanvas.css';
import './AdminBuilder.css';

const AdminBuilder = () => {
    const {
        loading, profiles, draft, dirty, activeId, canUndo, canRedo,
        newProfile, openProfile, closeDraft, saveDraft, publish, revertToDefault,
        removeProfile, duplicateProfile, addBlock, removeBlock, duplicateBlock,
        moveBlock, updateBlock, updateProps, updateStyle, updateBackground,
        updateAnimation, replaceBlocks, updateVisibility, setDraftMeta, undo, redo,
        exportDraft, importFromText, templates, saveBlockTemplate, removeTemplate,
        insertTemplate, slugConflict,
    } = useLayout();

    const { notify } = useNotification();

    const [selectedId, setSelectedId] = useState(null);
    const [incomingType, setIncomingType] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [namingOpen, setNamingOpen] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [kindDraft, setKindDraft] = useState('home');
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState('');
    const [device, setDevice] = useState('desktop');
    const [view, setView] = useState('visual');   // visual | outline
    const [products, setProducts] = useState([]);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [savingTemplate, setSavingTemplate] = useState(null);
    /* The preset waiting on confirmation. window.confirm() cannot be
       styled, ignores the admin theme, and on Chrome shows the raw
       "localhost:5173 says" origin — which looks like a browser warning
       rather than part of the product. */
    const [pendingPreset, setPendingPreset] = useState(null);
    const [templateName, setTemplateName] = useState('');

    const { isDarkMode } = useContext(ThemeContext);
    const { format } = useCurrency();

    const selected = useMemo(
        () => draft?.blocks.find((b) => b.id === selectedId) || null,
        [draft, selectedId]
    );

    /* Deleting the selected block must clear the inspector, or it keeps
       showing controls that write to something no longer there. */
    useEffect(() => {
        if (selectedId && draft && !draft.blocks.some((b) => b.id === selectedId)) {
            setSelectedId(null);
        }
    }, [draft, selectedId]);

    /* The canvas paints with the layout's own theme so the admin sees
       the real palette.
  
       Scoped to the editor element, never to <html>. Painting the
       document root here meant the effect's cleanup — which runs on
       every unmount, i.e. every time the admin leaves the builder —
       deleted the variables LayoutProvider had written for the live
       storefront. LayoutProvider does not re-run unless the active theme
       changes, so the shop was left on the raw hex fallbacks until the
       visitor toggled the light switch by hand. Confining the preview to
       this subtree keeps the two completely independent. */
    const editorRef = useRef(null);

    useEffect(() => {
        if (!draft || !editorRef.current) return undefined;
        return applyTheme(
            draft.followSeason ? undefined : draft.theme,
            isDarkMode,
            editorRef.current
        );
    }, [draft?.theme, draft?.followSeason, isDarkMode, draft]);

    /* Swapping the canvas for a preset. Shared by the confirm dialog and
       by the empty-canvas shortcut, so the two can never drift. */
    const applyPresetNow = (preset) => {
        const { theme, blocks } = applyPreset(preset);
        setDraftMeta({ theme });
        replaceBlocks(blocks);
        setSelectedId(null);
        setPendingPreset(null);
        notify.success(`Applied the “${preset.label}” preset.`);
    };

    /* Product rails need real products to preview against. */
    useEffect(() => {
        if (!draft) return undefined;

        let cancelled = false;
        const controller = new AbortController();

        import('axios').then(({ default: axios }) => {
            axios
                .get('https://dummyjson.com/products', {
                    params: { limit: 40, select: 'title,price,thumbnail,category,rating,discountPercentage' },
                    signal: controller.signal,
                })
                .then(({ data }) => {
                    if (!cancelled) setProducts(data.products || []);
                })
                .catch(() => { });
        });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [Boolean(draft)]);

    /* Keyboard: undo/redo and save. Ignored while typing so Ctrl+Z
       inside a text field still means "undo my typing". */
    useEffect(() => {
        const onKey = (event) => {
            const tag = event.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
            if (!(event.ctrlKey || event.metaKey)) return;

            const key = event.key.toLowerCase();

            if (key === 'z' && !event.shiftKey) {
                event.preventDefault();
                undo();
            } else if ((key === 'z' && event.shiftKey) || key === 'y') {
                event.preventDefault();
                redo();
            } else if (key === 's') {
                event.preventDefault();
                saveDraft();
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [undo, redo, saveDraft]);

    /* Leaving with unsaved work should cost a confirmation. */
    useEffect(() => {
        if (!dirty) return undefined;

        const warn = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const startNew = (kind = 'home') => {
        setNameDraft('');
        setKindDraft(kind);
        setNamingOpen(true);
    };

    const confirmNew = (event) => {
        event.preventDefault();
        const profile = newProfile(nameDraft.trim() || 'Untitled layout', kindDraft);
        setSelectedId(null);
        setNamingOpen(false);
        notify.info(`Created “${profile.name}”. Add some blocks.`);
    };

    /* ------------------------------ list view ------------------------ */
    if (!draft) {
        return (
            <div className="ab-page">
                <header className="ab-header">
                    <div>
                        <h1>Site Builder</h1>
                        <p>Arrange the storefront, choose a season, save it as a layout.</p>
                    </div>

                    <div className="ab-header-tools">
                        <button type="button" className="ab-tool" onClick={() => setImportOpen(true)}>
                            <i className="bi bi-upload" aria-hidden="true" />
                            Import
                        </button>
                        <button type="button" className="ab-tool" onClick={() => startNew('page')}>
                            <i className="bi bi-file-earmark-plus" aria-hidden="true" />
                            New page
                        </button>
                        <button type="button" className="ab-primary" onClick={() => startNew('home')}>
                            <i className="bi bi-plus-lg" aria-hidden="true" />
                            New layout
                        </button>
                    </div>
                </header>

                <section className={`ab-live ${activeId ? 'is-custom' : ''}`}>
                    <span className="ab-live-icon" aria-hidden="true">
                        <i className={`bi ${activeId ? 'bi-broadcast' : 'bi-house'}`} />
                    </span>

                    <div>
                        <strong>
                            {activeId
                                ? profiles.find((p) => p.id === activeId)?.name || 'A custom layout'
                                : 'Built-in layout'}
                        </strong>
                        <small>
                            {activeId
                                ? 'Shoppers are seeing your custom arrangement.'
                                : 'Shoppers see the original hand-built home page.'}
                        </small>
                    </div>

                    {activeId && (
                        <button type="button" className="ab-revert" onClick={revertToDefault}>
                            <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                            Restore default
                        </button>
                    )}
                </section>

                {loading ? (
                    <div className="ab-loading">
                        <span className="ab-spinner" aria-hidden="true" />
                        <p>Loading layouts…</p>
                    </div>
                ) : profiles.length === 0 ? (
                    <div className="ab-empty">
                        <i className="bi bi-layout-text-window-reverse" aria-hidden="true" />
                        <h2>No layouts yet</h2>
                        <p>
                            Build one from scratch, or start from the sections the store already has.
                        </p>
                        <button type="button" className="ab-primary" onClick={() => startNew('home')}>
                            <i className="bi bi-plus-lg" aria-hidden="true" />
                            Create your first layout
                        </button>
                    </div>
                ) : (
                    <div className="ab-grid">
                        {profiles.map((profile) => {
                            const theme = THEMES.find((t) => t.id === profile.theme) || THEMES[0];
                            const live = profile.id === activeId;

                            return (
                                <article className={`ab-card ${live ? 'is-live' : ''}`} key={profile.id}>
                                    <header>
                                        <span
                                            className="ab-card-swatch"
                                            style={{
                                                background: `linear-gradient(135deg, ${theme.light.accent}, ${theme.dark.accent})`,
                                            }}
                                            aria-hidden="true"
                                        >
                                            <i className={`bi ${theme.icon}`} />
                                        </span>

                                        <div>
                                            <strong>{profile.name}</strong>
                                            <small>
                                                {profile.kind === 'page' ? (
                                                    <>
                                                        <i className="bi bi-link-45deg" aria-hidden="true" /> /p/{profile.slug}
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="bi bi-house" aria-hidden="true" /> Home page
                                                    </>
                                                )}{' '}
                                                · {profile.blocks.length} block
                                                {profile.blocks.length === 1 ? '' : 's'}
                                            </small>
                                        </div>

                                        <span className="ab-card-flags">
                                            {live && <span className="ab-live-tag">Live</span>}
                                            {profile.kind === 'page' && profile.live && (
                                                <span className="ab-live-tag is-page">Published</span>
                                            )}
                                            {profile.schedule?.enabled && (
                                                <span className={`ab-sched-tag is-${scheduleState(profile).state}`}>
                                                    <i className="bi bi-clock" aria-hidden="true" />
                                                    {scheduleState(profile).label}
                                                </span>
                                            )}
                                            {profile.ab?.enabled && profile.ab.variantId && (
                                                <span className="ab-sched-tag is-ab">
                                                    <i className="bi bi-signpost-2" aria-hidden="true" />
                                                    A/B {profile.ab.split ?? 50}%
                                                </span>
                                            )}
                                        </span>
                                    </header>

                                    <div className="ab-card-actions">
                                        <button type="button" onClick={() => openProfile(profile.id)}>
                                            <i className="bi bi-pencil" aria-hidden="true" />
                                            Edit
                                        </button>

                                        {profile.kind === 'page' ? (
                                            profile.live && (
                                                <a
                                                    href={`/p/${profile.slug}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                                                    Visit
                                                </a>
                                            )
                                        ) : (
                                            !live && (
                                                <button type="button" onClick={() => publish(profile.id)}>
                                                    <i className="bi bi-broadcast" aria-hidden="true" />
                                                    Publish
                                                </button>
                                            )
                                        )}

                                        <button type="button" onClick={() => duplicateProfile(profile.id)}>
                                            <i className="bi bi-copy" aria-hidden="true" />
                                            Duplicate
                                        </button>

                                        <button
                                            type="button"
                                            className="is-danger"
                                            onClick={() => setConfirmDelete(profile)}
                                        >
                                            <i className="bi bi-trash3" aria-hidden="true" />
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}

                {/* ----------------------- naming dialog ----------------------- */}
                <AdminModal
                    open={namingOpen}
                    onClose={() => setNamingOpen(false)}
                    title="Name this layout"
                    subtitle="Something you will recognise later — “Winter sale”, “Ramadan”, “Black Friday”."
                    icon="bi-bookmark"
                    size="sm"
                    footer={
                        <>
                            <button type="button" className="am-btn is-plain" onClick={() => setNamingOpen(false)}>
                                Cancel
                            </button>
                            <button type="submit" form="ab-name-form" className="am-btn">
                                Create
                            </button>
                        </>
                    }
                >
                    <form id="ab-name-form" onSubmit={confirmNew}>
                        <div className="am-field is-full">
                            <label htmlFor="ab-name">Name</label>
                            <input
                                id="ab-name"
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                placeholder={kindDraft === 'page' ? 'Size guide' : 'Winter sale'}
                            />
                        </div>

                        <div className="am-field is-full">
                            <label>What are you building?</label>
                            <div className="ps-seg">
                                <button
                                    type="button"
                                    className={kindDraft === 'home' ? 'is-on' : ''}
                                    onClick={() => setKindDraft('home')}
                                >
                                    <i className="bi bi-house" aria-hidden="true" />
                                    Home page
                                </button>
                                <button
                                    type="button"
                                    className={kindDraft === 'page' ? 'is-on' : ''}
                                    onClick={() => setKindDraft('page')}
                                >
                                    <i className="bi bi-file-earmark" aria-hidden="true" />
                                    New page
                                </button>
                            </div>
                            <span className="am-hint">
                                {kindDraft === 'page'
                                    ? 'Gets its own address and can be added to the navigation bar.'
                                    : 'Replaces the storefront home page when published.'}
                            </span>
                        </div>
                    </form>
                </AdminModal>

                {/* ------------------------ import dialog ---------------------- */}
                <AdminModal
                    open={importOpen}
                    onClose={() => setImportOpen(false)}
                    title="Import a layout"
                    subtitle="Paste a layout JSON file exported from any ShopStream install."
                    icon="bi-upload"
                    size="md"
                    footer={
                        <>
                            <button type="button" className="am-btn is-plain" onClick={() => setImportOpen(false)}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="am-btn"
                                onClick={async () => {
                                    const ok = await importFromText(importText);
                                    if (ok) {
                                        setImportOpen(false);
                                        setImportText('');
                                    }
                                }}
                            >
                                Import
                            </button>
                        </>
                    }
                >
                    <div className="am-field is-full">
                        <label htmlFor="ab-import">Layout JSON</label>
                        <textarea
                            id="ab-import"
                            rows={10}
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            placeholder='{ "kind": "shopstream-layout", … }'
                        />
                    </div>
                </AdminModal>

                <ConfirmDialog
                    open={Boolean(confirmDelete)}
                    onClose={() => setConfirmDelete(null)}
                    onConfirm={() => {
                        removeProfile(confirmDelete.id);
                        setConfirmDelete(null);
                    }}
                    title="Delete this layout?"
                    message="The arrangement is removed from this device. Images it used stay in the library."
                    confirmLabel="Delete layout"
                    cancelLabel="Keep it"
                    footnote={confirmDelete?.id === activeId ? 'This layout is currently live' : undefined}
                >
                    {confirmDelete && (
                        <div className="am-preview">
                            <span className="am-preview-info">
                                <span className="am-preview-tag is-out">{confirmDelete.blocks.length} blocks</span>
                                <strong>{confirmDelete.name}</strong>
                            </span>
                        </div>
                    )}
                </ConfirmDialog>
            </div>
        );
    }

    /* ------------------------------ editor --------------------------- */
    return (
        <div className="ab-editor" ref={editorRef}>
            <header className="ab-bar">
                <button
                    type="button"
                    className="ab-back"
                    onClick={() => {
                        if (dirty && !window.confirm('Leave without saving your changes?')) return;
                        closeDraft();
                        setSelectedId(null);
                    }}
                >
                    <i className="bi bi-arrow-left" aria-hidden="true" />
                    <span>Layouts</span>
                </button>

                <div className="ab-bar-name">
                    <input
                        value={draft.name}
                        onChange={(e) => setDraftMeta({ name: e.target.value })}
                        aria-label="Layout name"
                    />
                    {dirty && <span className="ab-dot" title="Unsaved changes" />}
                </div>

                <div className="ab-bar-theme">
                    <label htmlFor="ab-theme" className="ab-sr">Season theme</label>
                    <select
                        id="ab-theme"
                        value={draft.theme}
                        onChange={(e) => setDraftMeta({ theme: e.target.value })}
                        disabled={draft.followSeason}
                    >
                        {THEMES.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.label}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        className={`ab-season ${draft.followSeason ? 'is-on' : ''}`}
                        onClick={() => setDraftMeta({ followSeason: !draft.followSeason })}
                        title="Pick the theme automatically from today's date"
                    >
                        <i className="bi bi-calendar-event" aria-hidden="true" />
                        Auto
                    </button>
                </div>

                <div className="ab-devices">
                    {Object.entries(DEVICES).map(([id, meta]) => (
                        <button
                            key={id}
                            type="button"
                            className={device === id ? 'is-on' : ''}
                            onClick={() => setDevice(id)}
                            title={`${meta.label} preview`}
                            aria-label={`${meta.label} preview`}
                            aria-pressed={device === id}
                        >
                            <i className={`bi ${meta.icon}`} aria-hidden="true" />
                        </button>
                    ))}

                    <span className="ab-sep" aria-hidden="true" />

                    <button
                        type="button"
                        className={view === 'outline' ? 'is-on' : ''}
                        onClick={() => setView(view === 'visual' ? 'outline' : 'visual')}
                        title={view === 'visual' ? 'Switch to the outline list' : 'Switch to the visual canvas'}
                        aria-label="Toggle view"
                    >
                        <i className={`bi ${view === 'visual' ? 'bi-list-ul' : 'bi-eye'}`} aria-hidden="true" />
                    </button>
                </div>

                <div className="ab-bar-tools">
                    <button
                        type="button"
                        className={settingsOpen ? 'is-on' : ''}
                        onClick={() => setSettingsOpen((v) => !v)}
                        title="Layout settings"
                        aria-label="Layout settings"
                    >
                        <i className="bi bi-gear" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                        <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
                        <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={exportDraft} title="Export as JSON">
                        <i className="bi bi-download" aria-hidden="true" />
                    </button>
                </div>

                <div className="ab-bar-save">
                    <button type="button" className="ab-tool" onClick={saveDraft} disabled={!dirty}>
                        <i className="bi bi-save" aria-hidden="true" />
                        Save
                    </button>
                    {draft.kind === 'page' ? (
                        <button
                            type="button"
                            className="ab-primary"
                            onClick={async () => {
                                await saveDraft();
                                setDraftMeta({ live: true });
                            }}
                            disabled={!draft.slug || slugConflict(draft.slug, draft.id)}
                            title={
                                slugConflict(draft.slug, draft.id)
                                    ? 'Another page already uses this address'
                                    : 'Save and take this page live'
                            }
                        >
                            <i className="bi bi-globe" aria-hidden="true" />
                            {draft.live ? 'Update page' : 'Go live'}
                        </button>
                    ) : (
                        <button type="button" className="ab-primary" onClick={() => publish()}>
                            <i className="bi bi-broadcast" aria-hidden="true" />
                            Publish
                        </button>
                    )}
                </div>
            </header>

            <div className="ab-work">
                <BlockPalette
                    onAdd={(type) => {
                        const block = addBlock(type);
                        setSelectedId(block.id);
                    }}
                    onDragType={setIncomingType}
                    templates={templates}
                    onInsertTemplate={(tpl) => {
                        const block = insertTemplate(tpl);
                        setSelectedId(block.id);
                    }}
                    onRemoveTemplate={removeTemplate}
                    onApplyPreset={(preset) => {
                        /* An empty canvas has nothing to lose, so skip the prompt. */
                        if (draft.blocks.length === 0) {
                            applyPresetNow(preset);
                            return;
                        }
                        setPendingPreset(preset);
                    }}
                />

                <main className="ab-canvas-wrap is-visual">
                    {view === 'visual' ? (
                        <VisualCanvas
                            blocks={draft.blocks}
                            selectedId={selectedId}
                            device={device}
                            isDark={isDarkMode}
                            products={products}
                            format={format}
                            incomingType={incomingType}
                            onSelect={setSelectedId}
                            onMove={moveBlock}
                            onAddAt={(type, index) => {
                                const block = addBlock(type, index);
                                setSelectedId(block.id);
                                setIncomingType(null);
                            }}
                            onRemove={removeBlock}
                            onDuplicate={duplicateBlock}
                            onToggleHidden={(id) => {
                                const block = draft.blocks.find((b) => b.id === id);
                                updateBlock(id, { hidden: !block.hidden });
                            }}
                        />
                    ) : (
                        <BuilderCanvas
                            blocks={draft.blocks}
                            selectedId={selectedId}
                            incomingType={incomingType}
                            onSelect={setSelectedId}
                            onMove={moveBlock}
                            onAddAt={(type, index) => {
                                const block = addBlock(type, index);
                                setSelectedId(block.id);
                                setIncomingType(null);
                            }}
                            onRemove={removeBlock}
                            onDuplicate={duplicateBlock}
                            onToggleHidden={(id) => {
                                const block = draft.blocks.find((b) => b.id === id);
                                updateBlock(id, { hidden: !block.hidden });
                            }}
                        />
                    )}
                </main>

                {settingsOpen ? (
                    <PageSettings
                        draft={draft}
                        profiles={profiles}
                        slugConflict={slugConflict}
                        onChange={setDraftMeta}
                        onClose={() => setSettingsOpen(false)}
                    />
                ) : (
                    <BlockInspector
                        block={selected}
                        onProps={(patch) => updateProps(selected.id, patch)}
                        onStyle={(patch) => updateStyle(selected.id, patch)}
                        onBackground={(patch) => updateBackground(selected.id, patch)}
                        onAnimation={(patch) => updateAnimation(selected.id, patch)}
                        onVisibility={(patch) => updateVisibility(selected.id, patch)}
                        onError={(message) => notify.warning('Image', message)}
                        onSaveTemplate={() => {
                            setTemplateName(selected.props?.heading?.trim() || '');
                            setSavingTemplate(selected);
                        }}
                    />
                )}
            </div>

            {/* ---------------------- save as a section --------------------- */}
            <AdminModal
                open={Boolean(savingTemplate)}
                onClose={() => setSavingTemplate(null)}
                title="Save as a reusable section"
                subtitle="Keeps the content, colours and motion exactly as they are now."
                icon="bi-bookmark-plus"
                size="sm"
                footer={
                    <>
                        <button type="button" className="am-btn is-plain" onClick={() => setSavingTemplate(null)}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="am-btn"
                            onClick={async () => {
                                await saveBlockTemplate(savingTemplate, templateName.trim());
                                setSavingTemplate(null);
                            }}
                        >
                            Save section
                        </button>
                    </>
                }
            >
                <div className="am-field is-full">
                    <label htmlFor="ab-tpl-name">Name</label>
                    <input
                        id="ab-tpl-name"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Hero with gradient"
                    />
                </div>
            </AdminModal>

            {/* -------------------- apply a preset -------------------- */}
            <ConfirmDialog
                open={Boolean(pendingPreset)}
                onClose={() => setPendingPreset(null)}
                onConfirm={() => applyPresetNow(pendingPreset)}
                /* Not destructive: one Ctrl+Z brings the old canvas back, so
                   this is a question rather than a warning. */
                tone="default"
                icon="bi-stars"
                confirmIcon="bi-magic"
                title={`Apply “${pendingPreset?.label}”?`}
                message={
                    pendingPreset
                        ? `This replaces the ${draft?.blocks.length} section${draft?.blocks.length === 1 ? '' : 's'
                        } on your canvas with ${presetBlockCount(pendingPreset)} new one${presetBlockCount(pendingPreset) === 1 ? '' : 's'
                        }, and switches the theme to ${pendingPreset.theme}.`
                        : ''
                }
                confirmLabel="Apply preset"
                cancelLabel="Keep my layout"
                footnote="Undo with Ctrl+Z if you change your mind."
            />
        </div>
    );
};

export default AdminBuilder;
