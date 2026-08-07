import React, { useEffect, useRef, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { BLOCK_MAP } from './blockTypes.js';
import BlockRenderer from '../../../components/layout/BlockRenderer.jsx';

/* ----------------------------------------------------------------
   The WYSIWYG canvas.

   Blocks are drawn by the same BlockRenderer the storefront uses, so
   the admin is arranging the real thing rather than a list of names.
   Everything this file adds is chrome: a hover outline, a floating
   toolbar, and the insertion indicator.

   The chrome is deliberately drawn *over* the block rather than
   wrapped around it — a wrapper would change the layout and break the
   promise that the canvas matches the site.
   ---------------------------------------------------------------- */

const DEVICES = {
    desktop: { label: 'Desktop', icon: 'bi-display', width: '100%' },
    tablet: { label: 'Tablet', icon: 'bi-tablet', width: '820px' },
    mobile: { label: 'Mobile', icon: 'bi-phone', width: '400px' },
};

const VisualCanvas = ({
    blocks,
    selectedId,
    device = 'desktop',
    isDark = false,
    products = [],
    format,
    onSelect,
    onMove,
    onAddAt,
    onRemove,
    onDuplicate,
    onToggleHidden,
    incomingType,
}) => {
    const [dragIndex, setDragIndex] = useState(null);
    const [overIndex, setOverIndex] = useState(null);
    const [hoverId, setHoverId] = useState(null);
    const scrollRef = useRef(null);

    /* Dropping outside a zone must still clear the indicator, otherwise
       a stale line hangs around until the next drag. */
    useEffect(() => {
        const clear = () => {
            setDragIndex(null);
            setOverIndex(null);
        };
        window.addEventListener('dragend', clear);
        window.addEventListener('drop', clear);
        return () => {
            window.removeEventListener('dragend', clear);
            window.removeEventListener('drop', clear);
        };
    }, []);

    const finishDrop = (index, event) => {
        event.preventDefault();
        event.stopPropagation();

        const newType = event.dataTransfer.getData('text/ss-block');

        if (newType) {
            onAddAt(newType, index);
        } else if (dragIndex !== null) {
            /* Removing the dragged row first shifts every later index down
               by one, so a forward move has to compensate. */
            onMove(dragIndex, dragIndex < index ? index - 1 : index);
        }

        setDragIndex(null);
        setOverIndex(null);
    };

    const armed = Boolean(incomingType) || dragIndex !== null;

    const DropZone = ({ index }) => (
        <div
            className={`vc-drop ${overIndex === index ? 'is-over' : ''} ${armed ? 'is-armed' : ''}`}
            onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = dragIndex !== null ? 'move' : 'copy';
                setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((c) => (c === index ? null : c))}
            onDrop={(event) => finishDrop(index, event)}
        >
            <span className="vc-drop-line" aria-hidden="true" />
            <span className="vc-drop-pill">
                <i className="bi bi-plus-lg" aria-hidden="true" />
                Drop here
            </span>
        </div>
    );

    return (
        <div className="vc" ref={scrollRef} onClick={() => onSelect(null)}>
            <div className={`vc-frame is-${device}`} style={{ maxWidth: DEVICES[device].width }}>
                {blocks.length === 0 ? (
                    <div
                        className={`vc-empty ${overIndex === 0 ? 'is-over' : ''}`}
                        onDragOver={(event) => {
                            event.preventDefault();
                            setOverIndex(0);
                        }}
                        onDragLeave={() => setOverIndex(null)}
                        onDrop={(event) => finishDrop(0, event)}
                    >
                        <i className="bi bi-magic" aria-hidden="true" />
                        <h2>Start building</h2>
                        <p>Drag a block from the left onto this canvas.</p>
                    </div>
                ) : (
                    <>
                        <DropZone index={0} />

                        {blocks.map((block, index) => {
                            const def = BLOCK_MAP[block.type];
                            const selected = block.id === selectedId;
                            const hovered = hoverId === block.id;

                            return (
                                <React.Fragment key={block.id}>
                                    <div
                                        className={`vc-block ${selected ? 'is-selected' : ''} ${hovered ? 'is-hovered' : ''
                                            } ${dragIndex === index ? 'is-dragging' : ''}`}
                                        onMouseEnter={() => setHoverId(block.id)}
                                        onMouseLeave={() => setHoverId((c) => (c === block.id ? null : c))}
                                    >
                                        {/* ---- floating label, top-left ---- */}
                                        <span className="vc-badge">
                                            <i className={`bi ${def?.icon}`} aria-hidden="true" />
                                            {def?.label}
                                            {block.hidden && <em>hidden</em>}
                                        </span>

                                        {/* ---- toolbar, top-right ---- */}
                                        <div className="vc-tools" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                className="vc-grip"
                                                draggable
                                                onDragStart={(event) => {
                                                    event.dataTransfer.effectAllowed = 'move';
                                                    event.dataTransfer.setData('text/plain', block.id);
                                                    setDragIndex(index);
                                                }}
                                                title="Drag to reorder"
                                                aria-label="Drag to reorder"
                                            >
                                                <i className="bi bi-arrows-move" aria-hidden="true" />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onMove(index, index - 1)}
                                                disabled={index === 0}
                                                title="Move up"
                                                aria-label="Move up"
                                            >
                                                <i className="bi bi-chevron-up" aria-hidden="true" />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onMove(index, index + 1)}
                                                disabled={index === blocks.length - 1}
                                                title="Move down"
                                                aria-label="Move down"
                                            >
                                                <i className="bi bi-chevron-down" aria-hidden="true" />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onToggleHidden(block.id)}
                                                title={block.hidden ? 'Show on the site' : 'Hide from the site'}
                                                aria-label={block.hidden ? 'Show block' : 'Hide block'}
                                            >
                                                <i
                                                    className={`bi ${block.hidden ? 'bi-eye-slash' : 'bi-eye'}`}
                                                    aria-hidden="true"
                                                />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onDuplicate(block.id)}
                                                title="Duplicate"
                                                aria-label="Duplicate"
                                            >
                                                <i className="bi bi-copy" aria-hidden="true" />
                                            </button>

                                            <button
                                                type="button"
                                                className="is-danger"
                                                onClick={() => onRemove(block.id)}
                                                title="Remove"
                                                aria-label="Remove"
                                            >
                                                <i className="bi bi-trash3" aria-hidden="true" />
                                            </button>
                                        </div>

                                        <BlockRenderer
                                            block={block}
                                            def={def}
                                            editing
                                            selected={selected}
                                            isDark={isDark}
                                            products={products}
                                            format={format}
                                            onSelect={onSelect}
                                        />
                                    </div>

                                    <DropZone index={index + 1} />
                                </React.Fragment>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
};

export { DEVICES };
export default VisualCanvas;
