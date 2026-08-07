import React, { useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import {
    BLOCK_MAP, ANIMATIONS, PADDINGS, WIDTHS, ALIGNMENTS, defaultStyle,
} from './blockTypes.js';
import { putImage, deleteImage, isImageRef } from '../../../lib/imageStore.js';
import { useResolvedImage } from '../../../lib/useResolvedImages.js';
import { compressImage } from '../ImageDropzone.jsx';
import { contrastVerdict, effectiveBackdrop, resolveTextColor } from '../../../components/layout/blockStyles.js';

/* ----------------------------------------------------------------
   The right-hand panel.

   Controls are generated from the block's `fields` schema, so a new
   block type needs no code here at all. The three tabs separate what
   the block says (Content), how it looks (Design) and how it arrives
   (Motion) — which matches how someone actually thinks about a
   section rather than a single long scroll of inputs.
   ---------------------------------------------------------------- */

/* Small helper so an image field can show a thumbnail of an idb: ref. */
const ImageField = ({ value, onChange, onError }) => {
    const url = useResolvedImage(value);
    const [busy, setBusy] = useState(false);

    const pick = async (file) => {
        if (!file) return;

        setBusy(true);
        try {
            const blob = await compressImage(file);
            const ref = await putImage(blob);

            /* Replacing an image must free the one it replaces, or every
               swap leaks a blob nobody can reach. */
            if (isImageRef(value)) deleteImage(value).catch(() => { });
            onChange(ref);
        } catch (error) {
            console.error('Image upload failed:', error);
            onError?.(error.message || 'That image could not be saved.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="insp-image">
            {url ? (
                <div className="insp-image-preview">
                    <img src={url} alt="" />
                    <button
                        type="button"
                        onClick={() => {
                            if (isImageRef(value)) deleteImage(value).catch(() => { });
                            onChange('');
                        }}
                        aria-label="Remove image"
                    >
                        <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                </div>
            ) : (
                <label className="insp-image-drop">
                    <i className={`bi ${busy ? 'bi-hourglass-split' : 'bi-cloud-arrow-up'}`} aria-hidden="true" />
                    {busy ? 'Processing…' : 'Upload an image'}
                    <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(event) => {
                            pick(event.target.files?.[0]);
                            event.target.value = '';
                        }}
                    />
                </label>
            )}

            <input
                type="url"
                className="insp-image-url"
                value={isImageRef(value) ? '' : value || ''}
                onChange={(event) => onChange(event.target.value)}
                placeholder="…or paste an image URL"
                disabled={isImageRef(value)}
            />
        </div>
    );
};

/* Renders one control, then appends its help text if it has any.

   Done as a wrapper rather than inside every branch of the switch:
   there are a dozen field kinds and adding the same three lines to each
   would guarantee one gets missed. */
const Field = (props) => {
    const control = <FieldControl {...props} />;
    if (!props.field.help) return control;

    return (
        <div className="insp-field-wrap">
            {control}
            <span className="insp-hint">{props.field.help}</span>
        </div>
    );
};

const FieldControl = ({ field, value, onChange, onError }) => {
    const id = `bi-${field.key}`;

    switch (field.kind) {
        case 'textarea':
            return (
                <div className="insp-field">
                    <label htmlFor={id}>{field.label}</label>
                    <textarea
                        id={id}
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={field.placeholder}
                        rows={4}
                    />
                </div>
            );

        case 'number':
            return (
                <div className="insp-field">
                    <label htmlFor={id}>
                        {field.label}
                        <span className="insp-value">{value ?? field.min}</span>
                    </label>
                    <input
                        id={id}
                        type="range"
                        min={field.min}
                        max={field.max}
                        step={field.step ?? 1}
                        value={value ?? field.min}
                        onChange={(e) => onChange(Number(e.target.value))}
                    />
                </div>
            );

        case 'select':
            return (
                <div className="insp-field">
                    <label htmlFor={id}>{field.label}</label>
                    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
                        {field.options.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            );

        case 'toggle':
            return (
                <div className="insp-toggle">
                    <span>{field.label}</span>
                    <button
                        type="button"
                        className={`am-switch is-green ${value ? 'is-on' : ''}`}
                        onClick={() => onChange(!value)}
                        role="switch"
                        aria-checked={Boolean(value)}
                        aria-label={field.label}
                    >
                        <span />
                    </button>
                </div>
            );

        case 'image':
            return (
                <div className="insp-field">
                    <label>{field.label}</label>
                    <ImageField value={value} onChange={onChange} onError={onError} />
                </div>
            );

        default:
            return (
                <div className="insp-field">
                    <label htmlFor={id}>{field.label}</label>
                    <input
                        id={id}
                        type="text"
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={field.placeholder}
                    />
                </div>
            );
    }
};

/* A repeating group — cards, buttons. */
const ListField = ({ field, items = [], onChange, onError }) => (
    <div className="insp-list">
        <div className="insp-list-head">
            <span>{field.label}</span>
            <button
                type="button"
                onClick={() => onChange([...items, field.newItem()])}
                disabled={items.length >= (field.max ?? 99)}
            >
                <i className="bi bi-plus-lg" aria-hidden="true" />
                Add
            </button>
        </div>

        {items.length === 0 && <p className="insp-list-empty">Nothing yet.</p>}

        {items.map((item, index) => (
            <details className="insp-list-item" key={index} open={index === items.length - 1}>
                <summary>
                    <span>{item.title || item.label || `Item ${index + 1}`}</span>

                    <span className="insp-list-tools">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                if (index === 0) return;
                                const next = [...items];
                                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                onChange(next);
                            }}
                            aria-label="Move up"
                        >
                            <i className="bi bi-chevron-up" aria-hidden="true" />
                        </button>

                        <button
                            type="button"
                            className="is-danger"
                            onClick={(e) => {
                                e.preventDefault();
                                onChange(items.filter((_, i) => i !== index));
                            }}
                            aria-label="Remove"
                        >
                            <i className="bi bi-trash3" aria-hidden="true" />
                        </button>
                    </span>
                </summary>

                <div className="insp-list-body">
                    {field.item.map((sub) => (
                        <Field
                            key={sub.key}
                            field={sub}
                            value={item[sub.key]}
                            onError={onError}
                            onChange={(v) =>
                                onChange(items.map((row, i) => (i === index ? { ...row, [sub.key]: v } : row)))
                            }
                        />
                    ))}
                </div>
            </details>
        ))}
    </div>
);

const BlockInspector = ({ block, onProps, onStyle, onBackground, onAnimation, onVisibility, onSaveTemplate, onError }) => {
    const [tab, setTab] = useState('content');

    if (!block) {
        return (
            <aside className="insp" aria-label="Block settings">
                <div className="insp-none">
                    <i className="bi bi-sliders2" aria-hidden="true" />
                    <p>Select a block to edit it.</p>
                </div>
            </aside>
        );
    }

    const def = BLOCK_MAP[block.type];
    const bg = block.style.background;

    return (
        <aside className="insp" aria-label={`${def?.label} settings`}>
            <header className="insp-head">
                <span className="insp-head-icon" aria-hidden="true">
                    <i className={`bi ${def?.icon}`} />
                </span>
                <div>
                    <strong>{def?.label}</strong>
                    <small>{def?.desc}</small>
                </div>

                {/* A block saved before a default changed keeps the old value,
            and once a control is removed there is no way to clear it by
            hand. This puts the block back to how a freshly dragged one
            would look, without deleting it and losing its position. */}
                <button
                    type="button"
                    className="insp-reset"
                    title="Put this section's content and design back to their defaults"
                    onClick={() => {
                        onProps(def.defaults());
                        onStyle(defaultStyle());
                    }}
                >
                    <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                    Reset
                </button>
            </header>

            <div className="insp-tabs" role="tablist">
                {[
                    { id: 'content', label: 'Content', icon: 'bi-pencil' },
                    { id: 'design', label: 'Design', icon: 'bi-palette' },
                    { id: 'motion', label: 'Motion', icon: 'bi-magic' },
                ].map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        className={tab === t.id ? 'is-active' : ''}
                        onClick={() => setTab(t.id)}
                    >
                        <i className={`bi ${t.icon}`} aria-hidden="true" />
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="insp-body">
                {/* ---------------------------- content --------------------------- */}
                {tab === 'content' && (
                    <>
                        {def?.native && (
                            <div className="am-notice is-info">
                                <i className="bi bi-database" aria-hidden="true" />
                                This section draws live data from the store. You control how it looks,
                                not what it lists.
                            </div>
                        )}

                        {def?.fields.map((field) =>
                            field.kind === 'list' ? (
                                <ListField
                                    key={field.key}
                                    field={field}
                                    items={block.props[field.key]}
                                    onError={onError}
                                    onChange={(items) => onProps({ [field.key]: items })}
                                />
                            ) : (
                                <Field
                                    key={field.key}
                                    field={field}
                                    value={block.props[field.key]}
                                    onError={onError}
                                    onChange={(v) => onProps({ [field.key]: v })}
                                />
                            )
                        )}
                    </>
                )}

                {/* ---------------------------- design ---------------------------- */}
                {tab === 'design' && (
                    <>
                        <div className="insp-field">
                            <label>Background</label>
                            <div className="insp-seg">
                                {[
                                    {
                                        id: 'none', label: 'Page', icon: 'bi-slash-circle',
                                        hint: 'Inherit the page colour, including any season theme'
                                    },
                                    {
                                        id: 'theme', label: 'Default', icon: 'bi-circle-half',
                                        hint: 'The plain light/dark surface, ignoring the season'
                                    },
                                    { id: 'color', label: 'Colour', icon: 'bi-paint-bucket' },
                                    { id: 'gradient', label: 'Gradient', icon: 'bi-rainbow' },
                                    { id: 'image', label: 'Image', icon: 'bi-image' },
                                ].map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        className={bg.kind === option.id ? 'is-on' : ''}
                                        onClick={() => onBackground({ kind: option.id })}
                                        title={option.hint}
                                    >
                                        <i className={`bi ${option.icon}`} aria-hidden="true" />
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {bg.kind === 'none' && (
                            <span className="insp-hint">
                                Follows the page — a season theme will tint this section.
                            </span>
                        )}

                        {bg.kind === 'theme' && (
                            <span className="insp-hint">
                                Stays on the plain light or dark surface even when a season
                                theme is active.
                            </span>
                        )}

                        {bg.kind === 'color' && (
                            <div className="insp-field">
                                <label htmlFor="insp-bg-color">Colour</label>
                                <div className="insp-color">
                                    <input
                                        id="insp-bg-color"
                                        type="color"
                                        value={bg.color}
                                        onChange={(e) => onBackground({ color: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        value={bg.color}
                                        onChange={(e) => onBackground({ color: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}

                        {bg.kind === 'gradient' && (
                            <>
                                <div className="insp-field">
                                    <label>From / to</label>
                                    <div className="insp-color">
                                        <input
                                            type="color"
                                            value={bg.from}
                                            onChange={(e) => onBackground({ from: e.target.value })}
                                            aria-label="Gradient start"
                                        />
                                        <input
                                            type="color"
                                            value={bg.to}
                                            onChange={(e) => onBackground({ to: e.target.value })}
                                            aria-label="Gradient end"
                                        />
                                    </div>
                                </div>

                                <div className="insp-field">
                                    <label htmlFor="insp-angle">
                                        Angle<span className="insp-value">{bg.angle}°</span>
                                    </label>
                                    <input
                                        id="insp-angle"
                                        type="range"
                                        min="0"
                                        max="360"
                                        step="5"
                                        value={bg.angle}
                                        onChange={(e) => onBackground({ angle: Number(e.target.value) })}
                                    />
                                </div>
                            </>
                        )}

                        {bg.kind === 'image' && (
                            <>
                                <div className="insp-field">
                                    <label>Image</label>
                                    <ImageField
                                        value={bg.image}
                                        onChange={(v) => onBackground({ image: v })}
                                        onError={onError}
                                    />
                                </div>

                                <div className="insp-field">
                                    <label htmlFor="insp-overlay">
                                        Dark overlay
                                        <span className="insp-value">{Math.round(bg.overlay * 100)}%</span>
                                    </label>
                                    <input
                                        id="insp-overlay"
                                        type="range"
                                        min="0"
                                        max="0.9"
                                        step="0.05"
                                        value={bg.overlay}
                                        onChange={(e) => onBackground({ overlay: Number(e.target.value) })}
                                    />
                                    <span className="insp-hint">Keeps text readable over a busy photo.</span>
                                </div>

                                <div className="insp-toggle">
                                    <span>Parallax (fixed)</span>
                                    <button
                                        type="button"
                                        className={`am-switch is-green ${bg.fixed ? 'is-on' : ''}`}
                                        onClick={() => onBackground({ fixed: !bg.fixed })}
                                        role="switch"
                                        aria-checked={bg.fixed}
                                        aria-label="Fixed background"
                                    >
                                        <span />
                                    </button>
                                </div>
                            </>
                        )}

                        {/* ---------- size: custom blocks only ----------

                A storefront section is drawn by the original HomePage
                markup, which sets its own padding, vertical rhythm,
                container and grid. Outer padding stacked on top of the
                section's own and doubled the gap; an outer height added
                dead space; an outer width fought the Bootstrap
                container already inside it. The section sizes itself,
                so none of these are offered for it. */}
                        {!def?.native && (
                            <>
                                <div className="insp-field">
                                    <label>Vertical padding</label>
                                    <div className="insp-seg is-compact">
                                        {PADDINGS.map((p) => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                className={block.style.padding === p.id ? 'is-on' : ''}
                                                onClick={() => onStyle({ padding: p.id })}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="insp-field">
                                    <label>
                                        Section height
                                        <span className="insp-value">
                                            {block.style.minHeight > 0 ? `${block.style.minHeight}px` : 'Auto'}
                                        </span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="900"
                                        step="20"
                                        value={block.style.minHeight || 0}
                                        onChange={(event) => onStyle({ minHeight: Number(event.target.value) })}
                                        aria-label="Section height in pixels"
                                    />
                                    <span className="insp-hint">
                                        Auto grows with the content. A set height never clips it —
                                        the section grows past this if it has to.
                                    </span>
                                </div>

                                {/* Only meaningful once there is spare space to distribute. */}
                                {block.style.minHeight > 0 && (
                                    <div className="insp-field">
                                        <label>Content position</label>
                                        <div className="insp-seg is-compact">
                                            {[
                                                { id: 'start', label: 'Top' },
                                                { id: 'center', label: 'Middle' },
                                                { id: 'end', label: 'Bottom' },
                                            ].map((v) => (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    className={(block.style.verticalAlign || 'center') === v.id ? 'is-on' : ''}
                                                    onClick={() => onStyle({ verticalAlign: v.id })}
                                                >
                                                    {v.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="insp-field">
                                    <label>Content width</label>
                                    <div className="insp-seg is-compact">
                                        {WIDTHS.map((w) => (
                                            <button
                                                key={w.id}
                                                type="button"
                                                className={block.style.width === w.id ? 'is-on' : ''}
                                                onClick={() => onStyle({ width: w.id })}
                                            >
                                                {w.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* The pixel slider only appears once Custom is chosen, so
                the common case stays a simple four-way choice. */}
                                {block.style.width === 'custom' && (
                                    <div className="insp-field">
                                        <label>
                                            Maximum width
                                            <span className="insp-value">{block.style.maxWidth || 1100}px</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="320"
                                            max="1600"
                                            step="20"
                                            value={block.style.maxWidth || 1100}
                                            onChange={(event) => onStyle({ maxWidth: Number(event.target.value) })}
                                            aria-label="Maximum content width in pixels"
                                        />
                                        <span className="insp-hint">
                                            A ceiling, not a fixed size — on a screen narrower than
                                            this the section still shrinks to fit.
                                        </span>
                                    </div>
                                )}

                            </>
                        )}

                        <div className="insp-field">
                            <label>Text alignment</label>
                            <div className="insp-seg is-compact">
                                {ALIGNMENTS.map((a) => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        className={block.style.align === a.id ? 'is-on' : ''}
                                        onClick={() => onStyle({ align: a.id })}
                                    >
                                        {a.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* A live readability check. Guessing at contrast is the
                single easiest way to ship an unreadable section. */}
                        {(() => {
                            const backdrop = effectiveBackdrop(bg, '#ffffff');
                            const ink = resolveTextColor(block.style, false);
                            const verdict = contrastVerdict(ink, backdrop);

                            return (
                                <div className={`insp-contrast is-${verdict.tone}`}>
                                    <span className="insp-contrast-chip" style={{ background: backdrop, color: ink }}>
                                        Aa
                                    </span>
                                    <div>
                                        <strong>{verdict.label}</strong>
                                        <small>
                                            {verdict.ratio.toFixed(2)}:1 · {verdict.level}
                                        </small>
                                    </div>
                                    <i
                                        className={`bi ${verdict.tone === 'ok' ? 'bi-check-circle-fill' : verdict.tone === 'warn' ? 'bi-exclamation-triangle-fill' : 'bi-x-circle-fill'}`}
                                        aria-hidden="true"
                                    />
                                </div>
                            );
                        })()}

                        <div className="insp-field">
                            <label>Text colour</label>
                            <div className="insp-seg is-compact">
                                {[
                                    { id: 'auto', label: 'Auto' },
                                    { id: 'light', label: 'Light' },
                                    { id: 'dark', label: 'Dark' },
                                ].map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        className={block.style.textColor === option.id ? 'is-on' : ''}
                                        onClick={() => onStyle({ textColor: option.id })}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <span className="insp-hint">Auto reads the background brightness.</span>
                        </div>

                        <div className="insp-field">
                            <label>Show on</label>
                            <div className="insp-seg is-compact">
                                {[
                                    { id: 'mobile', label: 'Mobile', icon: 'bi-phone' },
                                    { id: 'tablet', label: 'Tablet', icon: 'bi-tablet' },
                                    { id: 'desktop', label: 'Desktop', icon: 'bi-display' },
                                ].map((bp) => {
                                    const on = block.visibility?.[bp.id] !== false;
                                    return (
                                        <button
                                            key={bp.id}
                                            type="button"
                                            className={on ? 'is-on' : ''}
                                            onClick={() => onVisibility({ [bp.id]: !on })}
                                            aria-pressed={on}
                                            title={on ? `Visible on ${bp.label.toLowerCase()}` : `Hidden on ${bp.label.toLowerCase()}`}
                                        >
                                            <i className={`bi ${bp.icon}`} aria-hidden="true" />
                                            {bp.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <span className="insp-hint">Hide a block on one screen size without deleting it.</span>
                        </div>

                        <div className="insp-field">
                            <label htmlFor="insp-radius">
                                Corner radius<span className="insp-value">{block.style.radius}px</span>
                            </label>
                            <input
                                id="insp-radius"
                                type="range"
                                min="0"
                                max="48"
                                step="2"
                                value={block.style.radius}
                                onChange={(e) => onStyle({ radius: Number(e.target.value) })}
                            />
                        </div>

                        {onSaveTemplate && (
                            <button type="button" className="insp-save-tpl" onClick={onSaveTemplate}>
                                <i className="bi bi-bookmark-plus" aria-hidden="true" />
                                Save as a reusable section
                            </button>
                        )}
                    </>
                )}

                {/* ---------------------------- motion ---------------------------- */}
                {tab === 'motion' && (
                    <>
                        <div className="insp-field">
                            <label>Entrance</label>
                            <div className="insp-anims">
                                {ANIMATIONS.map((a) => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        className={block.animation.preset === a.id ? 'is-on' : ''}
                                        onClick={() => onAnimation({ preset: a.id })}
                                        title={a.hint}
                                    >
                                        <span className={`insp-anim-demo is-${a.id}`} aria-hidden="true" />
                                        {a.label}
                                    </button>
                                ))}
                            </div>
                            <span className="insp-hint">Hover a tile to see how it moves.</span>
                        </div>

                        <div className="insp-field">
                            <label htmlFor="insp-dur">
                                Duration<span className="insp-value">{block.animation.duration}ms</span>
                            </label>
                            <input
                                id="insp-dur"
                                type="range"
                                min="150"
                                max="1600"
                                step="50"
                                value={block.animation.duration}
                                onChange={(e) => onAnimation({ duration: Number(e.target.value) })}
                            />
                        </div>

                        <div className="insp-field">
                            <label htmlFor="insp-delay">
                                Delay<span className="insp-value">{block.animation.delay}ms</span>
                            </label>
                            <input
                                id="insp-delay"
                                type="range"
                                min="0"
                                max="1200"
                                step="50"
                                value={block.animation.delay}
                                onChange={(e) => onAnimation({ delay: Number(e.target.value) })}
                            />
                        </div>

                        <div className="insp-field">
                            <label htmlFor="insp-stagger">
                                Stagger between cards
                                <span className="insp-value">{block.animation.stagger}ms</span>
                            </label>
                            <input
                                id="insp-stagger"
                                type="range"
                                min="0"
                                max="300"
                                step="10"
                                value={block.animation.stagger}
                                onChange={(e) => onAnimation({ stagger: Number(e.target.value) })}
                            />
                            <span className="insp-hint">Children arrive one after another.</span>
                        </div>

                        <div className="insp-toggle">
                            <span>Animate once only</span>
                            <button
                                type="button"
                                className={`am-switch is-green ${block.animation.once ? 'is-on' : ''}`}
                                onClick={() => onAnimation({ once: !block.animation.once })}
                                role="switch"
                                aria-checked={block.animation.once}
                                aria-label="Animate once"
                            >
                                <span />
                            </button>
                        </div>

                        <div className="am-notice is-info">
                            <i className="bi bi-universal-access" aria-hidden="true" />
                            Visitors who ask for reduced motion always see content immediately —
                            these settings are skipped for them.
                        </div>
                    </>
                )}
            </div>
        </aside>
    );
};

export default BlockInspector;
