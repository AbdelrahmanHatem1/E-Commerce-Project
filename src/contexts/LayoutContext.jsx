import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { UNSAFE_LocationContext } from 'react-router-dom';
import { useNotification } from '../components/Notification.jsx';
import {
    listProfiles, getProfile, saveProfile, deleteProfile,
    listTemplates, saveTemplate, deleteTemplate,
    readActiveId, writeActiveId, emptyProfile, exportProfile, importProfile,
    isScheduleOpen, assignBucket, slugify,
} from '../lib/layoutStore.js';
import { createBlock, cloneBlock, makeBlockId } from '../pages/admin/builder/blockTypes.js';
import { seasonForDate, applyTheme } from '../pages/admin/builder/themes.js';

const LayoutContext = createContext();

/* ------------------------------------------------------------------
   The current path, without requiring a router.

   `useLocation` throws outside a <Router>, and this provider is also
   mounted bare in tests and could be reused in a non-routed shell.
   Reading the context directly returns undefined instead of throwing,
   which is exactly the degradation we want: no router simply means the
   path never changes.
   ------------------------------------------------------------------ */
const useSafePathname = () => {
    const location = useContext(UNSAFE_LocationContext);
    return location?.location?.pathname ?? '';
};

/* How many steps back the builder can go. Each entry is a full copy of
   the block list, so this is a memory/utility trade-off rather than an
   arbitrary number. */
const HISTORY_LIMIT = 40;

export const LayoutProvider = ({ children }) => {
    const { notify } = useNotification();
    const pathname = useSafePathname();

    const [profiles, setProfiles] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [draft, setDraft] = useState(null);      // the profile being edited
    const [activeId, setActiveId] = useState(readActiveId);

    /* Re-evaluated on a timer so a schedule can open or close without a
       reload. One minute is fine: nobody schedules to the second. */
    const [clock, setClock] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setClock(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);

    const undoStack = useRef([]);
    const redoStack = useRef([]);
    const [historyTick, setHistoryTick] = useState(0);

    /* --------------------------- bootstrap -------------------------- */
    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            const [all, tpl] = await Promise.all([listProfiles(), listTemplates()]);
            if (cancelled) return;

            setProfiles(all);
            setTemplates(tpl);

            setLoading(false);
        };

        boot();
        return () => {
            cancelled = true;
        };
    }, []);

    /* Other tabs may publish a different layout. */
    useEffect(() => {
        const sync = (event) => {
            if (event.key !== 'shopstream_layout_active') return;

            setActiveId(readActiveId());
            /* The profile list is the source of truth; refresh it so the
               derived `published` recomputes. */
            listProfiles().then(setProfiles);
        };

        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);

    /* ---------------------------- history --------------------------- */
    const pushHistory = useCallback((blocks) => {
        undoStack.current.push(structuredClone(blocks));
        if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
        /* Any new edit invalidates the redo branch. */
        redoStack.current = [];
        setHistoryTick((t) => t + 1);
    }, []);

    /* Every mutation funnels through here so history and the dirty flag
       can never drift out of step with the blocks themselves. */
    const mutate = useCallback(
        (fn) => {
            setDraft((current) => {
                if (!current) return current;
                pushHistory(current.blocks);
                return { ...current, blocks: fn(current.blocks) };
            });
            setDirty(true);
        },
        [pushHistory]
    );

    const undo = useCallback(() => {
        setDraft((current) => {
            if (!current || undoStack.current.length === 0) return current;

            redoStack.current.push(structuredClone(current.blocks));
            const previous = undoStack.current.pop();
            setHistoryTick((t) => t + 1);
            return { ...current, blocks: previous };
        });
        setDirty(true);
    }, []);

    const redo = useCallback(() => {
        setDraft((current) => {
            if (!current || redoStack.current.length === 0) return current;

            undoStack.current.push(structuredClone(current.blocks));
            const next = redoStack.current.pop();
            setHistoryTick((t) => t + 1);
            return { ...current, blocks: next };
        });
        setDirty(true);
    }, []);

    /* ------------------------ profile handling ---------------------- */
    const newProfile = useCallback((name, kind = 'home') => {
        const profile = emptyProfile(name || 'Untitled layout', kind);
        undoStack.current = [];
        redoStack.current = [];
        setDraft(profile);
        setDirty(true);
        setHistoryTick((t) => t + 1);
        return profile;
    }, []);

    const openProfile = useCallback(async (id) => {
        const profile = await getProfile(id);
        if (!profile) return null;

        undoStack.current = [];
        redoStack.current = [];
        setDraft(structuredClone(profile));
        setDirty(false);
        setHistoryTick((t) => t + 1);
        return profile;
    }, []);

    const closeDraft = useCallback(() => {
        setDraft(null);
        setDirty(false);
        undoStack.current = [];
        redoStack.current = [];
    }, []);

    const persist = useCallback(
        async (profile) => {
            try {
                const saved = await saveProfile(profile);
                setProfiles((current) => {
                    const rest = current.filter((p) => p.id !== saved.id);
                    return [saved, ...rest];
                });

                return saved;
            } catch (error) {
                console.error('Failed to save the layout:', error);
                notify.error('Could not save', 'The layout could not be written to this device.');
                return null;
            }
        },
        [notify]
    );

    const saveDraft = useCallback(async () => {
        if (!draft) return null;

        const saved = await persist(draft);
        if (saved) {
            setDraft(saved);
            setDirty(false);
            notify.success(`Saved “${saved.name}”.`);
        }
        return saved;
    }, [draft, persist, notify]);

    const publish = useCallback(
        async (id) => {
            const target = id || draft?.id;
            if (!target) return;

            /* Publishing an unsaved draft has to save it first, or the
               storefront would read a stale copy from the database. */
            if (draft && draft.id === target && dirty) await persist(draft);

            writeActiveId(target);
            setActiveId(target);
            notify.success('Layout published.', 'Shoppers see it on their next page load.');
        },
        [draft, dirty, persist, notify]
    );

    /* Back to the hand-built HomePage. */
    const revertToDefault = useCallback(() => {
        writeActiveId('');
        setActiveId('');
        notify.info('Reverted to the built-in layout.');
    }, [notify]);

    const removeProfile = useCallback(
        async (id) => {
            await deleteProfile(id);
            setProfiles((current) => current.filter((p) => p.id !== id));

            if (readActiveId() === id) {
                writeActiveId('');
                setActiveId('');
            }
            if (draft?.id === id) closeDraft();

            notify.info('Layout deleted.');
        },
        [draft, closeDraft, notify]
    );

    const duplicateProfile = useCallback(
        async (id) => {
            const source = await getProfile(id);
            if (!source) return null;

            const copy = {
                ...structuredClone(source),
                id: emptyProfile().id,
                name: `${source.name} (copy)`,
                createdAt: new Date().toISOString(),
            };

            const saved = await persist(copy);
            if (saved) notify.success(`Duplicated as “${saved.name}”.`);
            return saved;
        },
        [persist, notify]
    );

    /* --------------------------- block edits ------------------------ */
    const addBlock = useCallback(
        (type, index) => {
            const block = createBlock(type);
            mutate((blocks) => {
                const next = [...blocks];
                next.splice(index ?? next.length, 0, block);
                return next;
            });
            return block;
        },
        [mutate]
    );

    const removeBlock = useCallback(
        (id) => mutate((blocks) => blocks.filter((b) => b.id !== id)),
        [mutate]
    );

    const duplicateBlock = useCallback(
        (id) =>
            mutate((blocks) => {
                const index = blocks.findIndex((b) => b.id === id);
                if (index === -1) return blocks;

                const next = [...blocks];
                next.splice(index + 1, 0, cloneBlock(blocks[index]));
                return next;
            }),
        [mutate]
    );

    const moveBlock = useCallback(
        (from, to) =>
            mutate((blocks) => {
                if (from === to || from < 0 || to < 0 || from >= blocks.length) return blocks;

                const next = [...blocks];
                const [moved] = next.splice(from, 1);
                next.splice(Math.min(to, next.length), 0, moved);
                return next;
            }),
        [mutate]
    );

    const updateBlock = useCallback(
        (id, patch) =>
            mutate((blocks) => blocks.map((b) => (b.id === id ? { ...b, ...patch } : b))),
        [mutate]
    );

    /* Convenience wrappers so callers never hand-merge nested objects
       and accidentally drop a sibling key. */
    const updateProps = useCallback(
        (id, patch) =>
            mutate((blocks) =>
                blocks.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...patch } } : b))
            ),
        [mutate]
    );

    const updateStyle = useCallback(
        (id, patch) =>
            mutate((blocks) =>
                blocks.map((b) => (b.id === id ? { ...b, style: { ...b.style, ...patch } } : b))
            ),
        [mutate]
    );

    const updateBackground = useCallback(
        (id, patch) =>
            mutate((blocks) =>
                blocks.map((b) =>
                    b.id === id
                        ? { ...b, style: { ...b.style, background: { ...b.style.background, ...patch } } }
                        : b
                )
            ),
        [mutate]
    );

    const updateAnimation = useCallback(
        (id, patch) =>
            mutate((blocks) =>
                blocks.map((b) => (b.id === id ? { ...b, animation: { ...b.animation, ...patch } } : b))
            ),
        [mutate]
    );

    /* Swap the whole block list at once — used by presets. Goes through
       mutate() so it lands on the undo stack like any other edit. */
    const replaceBlocks = useCallback(
        (blocks) => mutate(() => structuredClone(blocks)),
        [mutate]
    );

    /* Per-breakpoint visibility, stored outside `style` because it is a
       structural decision rather than a cosmetic one. */
    const updateVisibility = useCallback(
        (id, patch) =>
            mutate((blocks) =>
                blocks.map((b) =>
                    b.id === id
                        ? { ...b, visibility: { mobile: true, tablet: true, desktop: true, ...b.visibility, ...patch } }
                        : b
                )
            ),
        [mutate]
    );

    /* ------------------------- templates ---------------------------- */

    /* Save one configured block for reuse. Stored as a deep copy so a
       later edit to the original does not rewrite the template. */
    const saveBlockTemplate = useCallback(
        async (block, name) => {
            const record = await saveTemplate({
                name: name || 'Saved section',
                type: block.type,
                block: structuredClone({ ...block, id: undefined }),
            });

            setTemplates((current) => [record, ...current]);
            notify.success(`Saved “${record.name}” to your sections.`);
            return record;
        },
        [notify]
    );

    const removeTemplate = useCallback(
        async (id) => {
            await deleteTemplate(id);
            setTemplates((current) => current.filter((t) => t.id !== id));
            notify.info('Section removed.');
        },
        [notify]
    );

    const insertTemplate = useCallback(
        (template, index) => {
            const block = { ...structuredClone(template.block), id: makeBlockId(template.type) };
            mutate((blocks) => {
                const next = [...blocks];
                next.splice(index ?? next.length, 0, block);
                return next;
            });
            return block;
        },
        [mutate]
    );

    /* ------------------------ page validation ----------------------- */

    /* Two live pages on the same slug would make one unreachable, so the
       builder refuses the collision rather than silently picking one. */
    const slugConflict = useCallback(
        (slug, selfId) =>
            profiles.some((p) => p.kind === 'page' && p.slug === slug && p.id !== selfId),
        [profiles]
    );

    const setDraftMeta = useCallback((patch) => {
        setDraft((current) => (current ? { ...current, ...patch } : current));
        setDirty(true);
    }, []);

    /* --------------------------- portability ------------------------ */
    const exportDraft = useCallback(() => {
        if (!draft) return;

        const blob = new Blob([exportProfile(draft)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${draft.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        notify.success('Layout exported.');
    }, [draft, notify]);

    const importFromText = useCallback(
        async (text) => {
            try {
                const profile = importProfile(text);
                const saved = await persist(profile);
                if (saved) notify.success(`Imported “${saved.name}”.`);
                return saved;
            } catch (error) {
                console.error('Layout import failed:', error);
                notify.error('Import failed', error.message);
                return null;
            }
        },
        [persist, notify]
    );

    /* ----------------------------------------------------------------
       What the storefront actually renders for the home page.
  
       Three gates, in order: the admin picked it, its schedule window is
       open, and — if it is an A/B test — this visitor drew the winning
       bucket. Derived rather than stored, so a schedule that opens at
       midnight starts working on its own.
       ---------------------------------------------------------------- */
    const published = useMemo(() => {
        const chosen = activeId ? profiles.find((p) => p.id === activeId) : null;
        if (!chosen) return null;

        if (!isScheduleOpen(chosen, clock)) return null;

        if (chosen.ab?.enabled && chosen.ab.variantId) {
            const bucket = assignBucket(chosen.id, chosen.ab.split ?? 50);
            if (bucket === 'b') {
                const variant = profiles.find((p) => p.id === chosen.ab.variantId);
                /* A deleted or out-of-window variant falls back to A rather
                   than showing the visitor nothing at all. */
                if (variant && isScheduleOpen(variant, clock)) return variant;
            }
        }

        return chosen;
    }, [activeId, profiles, clock]);

    /* Standalone pages the admin has taken live, with their schedules
       respected. The router and the navbar both read this. */
    const livePages = useMemo(
        () =>
            profiles.filter(
                (p) => p.kind === 'page' && p.live && p.slug && isScheduleOpen(p, clock)
            ),
        [profiles, clock]
    );

    const navPages = useMemo(
        () => livePages.filter((p) => p.showInNav),
        [livePages]
    );

    /* The theme the storefront should paint right now. */
    const activeTheme = useMemo(() => {
        if (!published) return 'default';
        if (published.followSeason) return seasonForDate();
        return published.theme || 'default';
    }, [published]);

    /* ----------------------------------------------------------------
       Paint the palette from the provider rather than from a component
       further down the tree.
  
       Doing it in a child meant the variables were only written after
       that child mounted, so a page rendered on the same tick — or any
       route the child did not sit above — kept the previous colours
       until something forced a re-render. Writing them here means the
       palette is in place before any consumer paints, and it follows
       `isDark` so flipping the light switch repaints immediately.
       ---------------------------------------------------------------- */
    useEffect(() => {
        const paint = () => {
            /* `body.dark` is the ONLY source of truth.
      
               The previous version OR-ed in `prefers-color-scheme`, which
               meant a visitor whose operating system is set to dark got the
               dark palette even after switching the site to light: the page
               went light, the palette stayed dark, and the navbar and footer
               appeared welded to dark mode. ThemeProvider already seeds the
               class from localStorage before the first paint, so there is
               nothing for a media query to fall back to. */
            const isDark = document.body.classList.contains('dark');
            return applyTheme(activeTheme, isDark);
        };

        let cleanup = paint();

        /* The theme class is toggled outside React, so an observer is the
           only reliable way to hear about it. */
        const observer = new MutationObserver(() => {
            cleanup?.();
            cleanup = paint();
        });

        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        /* Re-assert the palette whenever the route changes.
    
           Anything that paints <html> and then cleans up after itself — the
           builder preview being the obvious one — can leave the variables
           missing while this effect's dependencies are unchanged. Re-running
           on navigation costs nothing (the values are identical) and closes
           that window, so clicking "Home" lands on the themed page instead
           of the raw fallbacks. */
        return () => {
            observer.disconnect();
            cleanup?.();
        };
    }, [activeTheme, pathname]);

    const value = useMemo(
        () => ({
            loading,
            profiles,
            draft,
            dirty,
            activeId,
            published,
            activeTheme,
            /* historyTick is unused by consumers but its presence in the
               dependency list is what recomputes canUndo/canRedo. */
            canUndo: undoStack.current.length > 0,
            canRedo: redoStack.current.length > 0,
            historyTick,
            newProfile,
            openProfile,
            closeDraft,
            saveDraft,
            publish,
            revertToDefault,
            removeProfile,
            duplicateProfile,
            addBlock,
            removeBlock,
            duplicateBlock,
            moveBlock,
            updateBlock,
            updateProps,
            updateStyle,
            updateBackground,
            updateAnimation,
            replaceBlocks,
            updateVisibility,
            templates,
            saveBlockTemplate,
            removeTemplate,
            insertTemplate,
            livePages,
            navPages,
            slugConflict,
            setDraftMeta,
            undo,
            redo,
            exportDraft,
            importFromText,
        }),
        [
            loading, profiles, draft, dirty, activeId, published, activeTheme, historyTick,
            newProfile, openProfile, closeDraft, saveDraft, publish, revertToDefault,
            removeProfile, duplicateProfile, addBlock, removeBlock, duplicateBlock, moveBlock,
            updateBlock, updateProps, updateStyle, updateBackground, updateAnimation,
            replaceBlocks, updateVisibility, templates, saveBlockTemplate, removeTemplate,
            insertTemplate, livePages, navPages, slugConflict,
            setDraftMeta, undo, redo, exportDraft, importFromText,
        ]
    );

    return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
};

/* Throwing here is right for the builder, which cannot function
   without the provider. It is wrong for the storefront: a missing
   provider should mean "no custom layout", not a blank page. */
export const useLayout = () => {
    const context = useContext(LayoutContext);

    if (!context) {
        throw new Error('useLayout must be used inside <LayoutProvider>.');
    }

    return context;
};

/* Safe read for pages that merely want to know whether a custom
   layout exists. Falls back to the built-in arrangement. */
export const useOptionalLayout = () => {
    const context = useContext(LayoutContext);
    /* The fallback must expose every field a storefront consumer reads,
       or a missing provider turns into "cannot read property of
       undefined" one component deeper. */
    return (
        context ?? {
            published: null,
            activeTheme: 'default',
            loading: false,
            livePages: [],
            navPages: [],
        }
    );
};

export default LayoutContext;
