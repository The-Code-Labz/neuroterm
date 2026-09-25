import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../../lib/a11y';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface NewFileDialogProps {
  open: boolean;
  dirPath: string | null;
  busy?: boolean;
  error?: string | null;
  onCreate: (name: string) => void;
  onCancel: () => void;
}

/** Filename prompt for "New file" in the Explorer tree — same modal chrome
 * as ConfirmDialog, with a text field instead of a confirm/deny choice. */
export default function NewFileDialog({ open, dirPath, busy, error, onCreate, onCancel }: NewFileDialogProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  useFocusTrap(panelRef, open, busy ? undefined : onCancel);

  useEffect(() => {
    if (open) { setName(''); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [open]);

  if (!open) return null;

  const submit = () => { if (name.trim()) onCreate(name.trim()); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => !busy && onCancel()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-file-dialog-title"
        className="relative w-full max-w-sm rounded-xl border border-edge bg-surface2 shadow-window p-5 animate-dialog-in"
      >
        <h2 id="new-file-dialog-title" className="text-section-title text-ink-strong">New file</h2>
        <p className="mt-1 text-meta text-ink-muted font-technical truncate">in {dirPath}</p>
        <div className="mt-4">
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="filename.ext"
            aria-label="New file name"
          />
          {error && <p className="mt-2 text-meta text-danger">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
