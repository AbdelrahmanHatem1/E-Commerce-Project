import React, { useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { BLOCK_TYPES, BLOCK_GROUPS } from './blockTypes.js';
import { PRESET_LIST, presetBlockCount } from './presets.js';
import BlockThumb from './BlockThumb.jsx';

/* ----------------------------------------------------------------
   The left rail you drag blocks out of.

   Each entry shows a miniature drawing of the block's silhouette
   rather than an icon, so the admin picks by shape — the same way you
   choose a layout in any page builder.

   Native HTML5 drag and drop is used rather than a library: the whole
   interaction is "pick up a tile, drop it between two sections", and a
   dependency for that would outweigh the code it replaces.

   Every tile is also a button, because dragging is a mouse-only
   gesture and the palette has to work on touch and by keyboard too.
   ---------------------------------------------------------------- */
const BlockPalette = ({ onAdd, onDragType, onApplyPreset, templates = [], onInsertTemplate, onRemoveTemplate }) => {
    const [tab, setTab] = useState('blocks');
    const [query, setQuery] = useState('');
    const [openGroups, setOpenGroups] = useState(() => BLOCK_GROUPS.map((g) => g.id));

    const term = query.trim().toLowerCase();

    const matches = (block) =>
        !term ||
        block.label.toLowerCase().includes(term) ||
        block.desc.toLowerCase().includes(term);

    const toggleGroup = (id) =>
        setOpenGroups((current) =>
            current.includes(id) ? current.filter((g) => g !== id) : [...current, id]
        );

    return (
        <aside className="bp" aria-label="Block palette">
            <div className="bp-tabs" role="tablist">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'blocks'}
                    className={tab === 'blocks' ? 'is-active' : ''}
                    onClick={() => setTab('blocks')}
                >
                    <i className="bi bi-grid-1x2" aria-hidden="true" />
                    Blocks
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'presets'}
                    className={tab === 'presets' ? 'is-active' : ''}
                    onClick={() => setTab('presets')}
                >
                    <i className="bi bi-stars" aria-hidden="true" />
                    Presets
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'saved'}
                    className={tab === 'saved' ? 'is-active' : ''}
                    onClick={() => setTab('saved')}
                >
                    <i className="bi bi-bookmark" aria-hidden="true" />
                    Saved
                    {templates.length > 0 && <span className="bp-count">{templates.length}</span>}
                </button>
            </div>

            {tab === 'blocks' ? (
                <>
                    <div className="bp-search">
                        <i className="bi bi-search" aria-hidden="true" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search blocks…"
                            aria-label="Search blocks"
                        />
                    </div>

                    <div className="bp-scroll">
                        {BLOCK_GROUPS.map((group) => {
                            const blocks = BLOCK_TYPES.filter((b) => b.group === group.id && matches(b));
                            if (blocks.length === 0) return null;

                            const open = openGroups.includes(group.id) || Boolean(term);

                            return (
                                <section className="bp-group" key={group.id}>
                                    <button
                                        type="button"
                                        className="bp-group-head"
                                        onClick={() => toggleGroup(group.id)}
                                        aria-expanded={open}
                                    >
                                        <span>
                                            <strong>{group.label}</strong>
                                            <small>{group.hint}</small>
                                        </span>
                                        <i
                                            className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`}
                                            aria-hidden="true"
                                        />
                                    </button>

                                    {open && (
                                        <ul className="bp-grid">
                                            {blocks.map((block) => (
                                                <li key={block.type}>
                                                    <button
                                                        type="button"
                                                        className="bp-tile"
                                                        draggable
                                                        onDragStart={(event) => {
                                                            event.dataTransfer.effectAllowed = 'copy';
                                                            event.dataTransfer.setData('text/ss-block', block.type);
                                                            onDragType?.(block.type);
                                                        }}
                                                        onDragEnd={() => onDragType?.(null)}
                                                        onClick={() => onAdd(block.type)}
                                                        title={`${block.desc} — drag into place, or click to append`}
                                                    >
                                                        <span className="bp-tile-art">
                                                            <BlockThumb type={block.type} />
                                                        </span>

                                                        <span className="bp-tile-label">
                                                            {block.label}
                                                            {block.native && <em title="Uses live store data">live</em>}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                            );
                        })}

                        {term && BLOCK_TYPES.filter(matches).length === 0 && (
                            <p className="bp-empty">No blocks match “{query}”.</p>
                        )}
                    </div>

                    <p className="bp-hint">
                        <i className="bi bi-hand-index-thumb" aria-hidden="true" />
                        Drag a tile onto the canvas, or click to add it at the end.
                    </p>
                </>
            ) : tab === 'saved' ? (
                <>
                    <div className="bp-scroll">
                        {templates.length === 0 ? (
                            <p className="bp-preset-intro">
                                Nothing saved yet. Configure any block, then use
                                <strong> Save as section</strong> in its Design tab to reuse it here.
                            </p>
                        ) : (
                            <ul className="bp-saved">
                                {templates.map((tpl) => (
                                    <li key={tpl.id}>
                                        <button
                                            type="button"
                                            className="bp-saved-main"
                                            onClick={() => onInsertTemplate(tpl)}
                                            title="Insert this section"
                                        >
                                            <span className="bp-saved-art">
                                                <BlockThumb type={tpl.type} />
                                            </span>
                                            <span className="bp-saved-text">
                                                <strong>{tpl.name}</strong>
                                                <small>{BLOCK_TYPES.find((b) => b.type === tpl.type)?.label}</small>
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            className="bp-saved-x"
                                            onClick={() => onRemoveTemplate(tpl.id)}
                                            aria-label={`Delete ${tpl.name}`}
                                            title="Delete"
                                        >
                                            <i className="bi bi-trash3" aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <p className="bp-hint">
                        <i className="bi bi-bookmark-star" aria-hidden="true" />
                        Saved sections keep their colours, content and motion.
                    </p>
                </>
            ) : (
                <>
                    <div className="bp-scroll">
                        <p className="bp-preset-intro">
                            A ready-made arrangement. Applying one replaces everything on the canvas.
                        </p>

                        {PRESET_LIST.map((preset) => (
                            <button
                                type="button"
                                className="bp-preset"
                                key={preset.id}
                                onClick={() => onApplyPreset(preset)}
                            >
                                <span
                                    className="bp-preset-swatch"
                                    style={{ background: preset.swatch }}
                                    aria-hidden="true"
                                >
                                    <i className={`bi ${preset.icon}`} />
                                </span>

                                <span className="bp-preset-text">
                                    <strong>{preset.label}</strong>
                                    <small>{preset.desc}</small>
                                    <em>{presetBlockCount(preset)} blocks · {preset.theme}</em>
                                </span>
                            </button>
                        ))}
                    </div>

                    <p className="bp-hint">
                        <i className="bi bi-info-circle" aria-hidden="true" />
                        Start from a preset, then edit anything you like.
                    </p>
                </>
            )}
        </aside>
    );
};

export default BlockPalette;
