import React, { useCallback, useEffect, useRef } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './AdminModal.css';

/* ----------------------------------------------------------------
   One dialog shell for every admin modal.

   Handles the parts that are easy to get wrong and easy to forget:
   focus trapping, Escape, restoring focus on close and locking the
   page behind the overlay.
   ---------------------------------------------------------------- */
const AdminModal = ({
    open,
    onClose,
    title,
    subtitle,
    icon,
    children,
    footer,
    size = 'md',
    tone = 'default',
}) => {
    const dialogRef = useRef(null);
    const previousFocusRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;

        previousFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        /* Land on the first real control, not the close button. */
        const timer = setTimeout(() => {
            const target = dialogRef.current?.querySelector(
                'input:not([type="hidden"]), select, textarea, button:not(.am-close)'
            );
            target?.focus();
        }, 60);

        return () => {
            clearTimeout(timer);
            document.body.style.overflow = previousOverflow;
            previousFocusRef.current?.focus?.();
        };
    }, [open]);

    const handleKeyDown = useCallback(
        (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
                return;
            }

            if (event.key !== 'Tab') return;

            const focusable = dialogRef.current?.querySelectorAll(
                'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
            );

            if (!focusable?.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        },
        [onClose]
    );

    if (!open) return null;

    return (
        <div
            className="am-overlay"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            onKeyDown={handleKeyDown}
        >
            <div
                className={`am-dialog is-${size} is-${tone}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="am-title"
                ref={dialogRef}
            >
                <header className="am-head">
                    {icon && (
                        <span className={`am-head-icon is-${tone}`} aria-hidden="true">
                            <i className={`bi ${icon}`} />
                        </span>
                    )}

                    <div className="am-head-text">
                        <h2 id="am-title">{title}</h2>
                        {subtitle && <p>{subtitle}</p>}
                    </div>

                    <button type="button" className="am-close" onClick={onClose} aria-label="Close dialog">
                        <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                </header>

                <div className="am-body">{children}</div>

                {footer && <footer className="am-foot">{footer}</footer>}
            </div>
        </div>
    );
};

/* ----------------------------------------------------------------
   Destructive confirmation — the red dialogs in the design.
   ---------------------------------------------------------------- */
/* `tone` decides whether this reads as a warning or as an ordinary
   choice. Not everything that needs confirming is destructive —
   swapping the canvas for a preset is reversible with one Ctrl+Z, and
   dressing it in red trash-can imagery overstated it. */
export const ConfirmDialog = ({
    open,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm Delete',
    cancelLabel = 'Cancel and Go Back',
    footnote,
    busy = false,
    tone = 'danger',
    icon,
    confirmIcon,
    children,
}) => (
    <AdminModal open={open} onClose={onClose} title="" size="sm" tone={tone}>
        <div className={`am-confirm is-${tone}`}>
            <span className="am-confirm-icon" aria-hidden="true">
                <i className={`bi ${icon || (tone === 'danger' ? 'bi-exclamation-triangle' : 'bi-question-circle')}`} />
            </span>

            <h2>{title}</h2>
            <p>{message}</p>

            {children}

            <div className="am-confirm-actions">
                <button type="button" className="am-btn is-ghost" onClick={onClose} disabled={busy}>
                    {cancelLabel}
                </button>

                <button
                    type="button"
                    className={`am-btn ${tone === 'danger' ? 'is-danger' : 'is-primary'}`}
                    onClick={onConfirm}
                    disabled={busy}
                >
                    {busy ? (
                        <>
                            <span className="am-spinner" aria-hidden="true" />
                            Working…
                        </>
                    ) : (
                        <>
                            <i
                                className={`bi ${confirmIcon || (tone === 'danger' ? 'bi-trash3' : 'bi-check-lg')}`}
                                aria-hidden="true"
                            />
                            {confirmLabel}
                        </>
                    )}
                </button>
            </div>

            {footnote && (
                <p className="am-confirm-foot">
                    <i className={`bi ${tone === 'danger' ? 'bi-shield-lock' : 'bi-info-circle'}`} aria-hidden="true" />
                    {footnote}
                </p>
            )}
        </div>
    </AdminModal>
);

export default AdminModal;
