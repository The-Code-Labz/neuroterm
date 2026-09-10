import { useRef } from 'react';
import { useFocusTrap } from '../../lib/a11y';
import Button from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Product-styled confirmation — replaces browser `confirm()`. Default
 * focus lands on Cancel so a destructive action is never a reflex Enter. */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(panelRef, open, busy ? undefined : onCancel);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => !busy && onCancel()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="relative w-full max-w-sm rounded-xl border border-edge bg-surface2 shadow-window p-5 animate-dialog-in"
      >
        <h2 id="confirm-dialog-title" className="text-section-title text-ink-strong">{title}</h2>
        <p id="confirm-dialog-desc" className="mt-2 text-body text-ink-secondary">{description}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
            Cancel
          </Button>
          <Button variant={danger ? 'danger-solid' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
