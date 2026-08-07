import React, { useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { BLOCK_MAP } from './blockTypes.js';

/* ----------------------------------------------------------------
   The middle column: an ordered list of the blocks in the layout.

   This is a structural view, not a preview — a real preview lives
   behind the Preview toggle. Editing a list of labelled rows is far
   easier to reorder accurately than dragging rendered sections that
   might each be 600px tall.
   ---------------------------------------------------------------- */
const BuilderCanvas = ({
    blocks,
    selectedId,
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

    const finishDrop = (index, event) => {
        event.preventDefault();

        /* Two sources land here: a new block from the palette, and an
           existing row being reordered. */
        const newType = event.dataTransfer.getData('text/ss-block');

        if (newType) onAddAt(newType, index);
        else if (dragIndex !== null) onMove(dragIndex, dragIndex < index ? index - 1 : index);

        setDragIndex(null);
        setOverIndex(null);
    };

    const DropZone = ({ index }) => (
        <div
            className={`bc-drop ${overIndex === index ? 'is-over' : ''} ${incomingType || dragIndex !== null ? 'is-armed' : ''
                }`}
            onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = dragIndex !== null ? 'move' : 'copy';
                setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((c) => (c === index ? null : c))}
            onDrop={(event) => finishDrop(index, event)}
        >
            <span className="bc-drop-line" aria-hidden="true" />
            <span className="bc-drop-label">Drop here</span>
        </div>
    );

    if (blocks.length === 0) {
        return (
            <div className="bc">
                <div
                    className={`bc-empty ${overIndex === 0 ? 'is-over' : ''}`}
                    onDragOver={(event) => {
                        event.preventDefault();
                        setOverIndex(0);
                    }}
                    onDragLeave={() => setOverIndex(null)}
                    onDrop={(event) => finishDrop(0, event)}
                >
                    <i className="bi bi-layout-wtf" aria-hidden="true" />
                    <h2>Nothing here yet</h2>
                    <p>Drag a block from the left, or click one to add it.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bc">
            <DropZone index={0} />

            {blocks.map((block, index) => {
                const def = BLOCK_MAP[block.type];
                const selected = block.id === selectedId;

                return (
                    <React.Fragment key={block.id}>
                        <article
                            className={`bc-row ${selected ? 'is-selected' : ''} ${block.hidden ? 'is-hidden' : ''
                                } ${dragIndex === index ? 'is-dragging' : ''}`}
                            draggable
                            onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'move';
                                /* Firefox refuses to start a drag without payload. */
                                event.dataTransfer.setData('text/plain', block.id);
                                setDragIndex(index);
                            }}
                            onDragEnd={() => {
                                setDragIndex(null);
                                setOverIndex(null);
                            }}
                        >
                            <button
                                type="button"
                                className="bc-row-main"
                                onClick={() => onSelect(block.id)}
                                aria-pressed={selected}
                            >
                                <span className="bc-grip" aria-hidden="true">
                                    <i className="bi bi-grip-vertical" />
                                </span>

                                <span className="bc-icon" aria-hidden="true">
                                    <i className={`bi ${def?.icon || 'bi-square'}`} />
                                </span>

                                <span className="bc-text">
                                    <strong>
                                        {block.props?.heading?.trim() || def?.label || block.type}
                                        {block.hidden && <span className="bc-tag">Hidden</span>}
                                        {def?.native && <span className="bc-tag is-live">Live data</span>}
                                    </strong>
                                    <small>{def?.label}</small>
                                </span>
                            </button>

                            <div className="bc-actions">
                                <button
                                    type="button"
                                    onClick={() => onMove(index, index - 1)}
                                    disabled={index === 0}
                                    title="Move up"
                                    aria-label={`Move ${def?.label} up`}
                                >
                                    <i className="bi bi-chevron-up" aria-hidden="true" />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => onMove(index, index + 1)}
                                    disabled={index === blocks.length - 1}
                                    title="Move down"
                                    aria-label={`Move ${def?.label} down`}
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
                                    aria-label="Duplicate block"
                                >
                                    <i className="bi bi-copy" aria-hidden="true" />
                                </button>

                                <button
                                    type="button"
                                    className="is-danger"
                                    onClick={() => onRemove(block.id)}
                                    title="Remove"
                                    aria-label="Remove block"
                                >
                                    <i className="bi bi-trash3" aria-hidden="true" />
                                </button>
                            </div>
                        </article>

                        <DropZone index={index + 1} />
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default BuilderCanvas;
