import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../../lib/a11y';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface PromptDialogProps {
  open: boolean;
  title: string;
  /** Secondary line under the title — e.g. "in /workspace" or the path being renamed. */
  description?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** Generic single-field name prompt — used for New File, New Folder, and
 * Rename in the Explorer tree so all three share one modal implementation
 * instead of three near-identical ones. Pre-fills and pre-selects
 * `initialValue` for rename so the user can just start typing. */
export default function PromptDialog({
  open,
  title,
  description,
  initialValue = '',
  placeholder = 'name',
  confirmLabel = 'Create',
  busyLabel = 'Working…',
  busy,
  error,
  onConfirm,
  onCancel,
}: PromptDialogProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  useFocusTrap(panelRef, open, busy ? undefined : onCancel);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const submit = () => { if (value.trim()) onConfirm(value.trim()); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => !busy && onCancel()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
        className="relative w-full max-w-sm rounded-xl border border-edge bg-surface2 shadow-window p-5 animate-dialog-in"
      >
        <h2 id="prompt-dialog-title" className="text-section-title text-ink-strong">{title}</h2>
        {description && <p className="mt-1 text-meta text-ink-muted font-technical truncate">{description}</p>}
        <div className="mt-4">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder={placeholder}
            aria-label={title}
          />
          {error && <p className="mt-2 text-meta text-danger">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !value.trim()}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
