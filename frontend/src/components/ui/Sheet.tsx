import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../lib/a11y';
import IconButton from './IconButton';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** While true, Escape/backdrop-click/close-button are ignored — used to
   * keep the sheet open during an in-flight async save so errors surface in
   * place instead of the sheet vanishing and swallowing them. */
  busy?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

/** 520px right-side sheet (full-screen below 640px) replacing the old
 * centered scrolling connection-form modal. */
export default function Sheet({ open, title, onClose, busy = false, footer, children }: SheetProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, busy ? undefined : onClose);

  if (!open) return null;

  const requestClose = () => {
    if (busy) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={requestClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:w-[520px] h-full bg-surface1 border-l border-edge flex flex-col animate-sheet-in shadow-sheet"
      >
        <div className="flex-shrink-0 h-14 flex items-center justify-between px-5 border-b border-edge-subtle bg-surface1">
          <h2 className="text-section-title text-ink-strong">{title}</h2>
          <IconButton icon={<X size={16} strokeWidth={1.75} />} label="Close" onClick={requestClose} disabled={busy} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex-shrink-0 min-h-[64px] flex items-center gap-3 px-5 border-t border-edge-subtle bg-surface1">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
