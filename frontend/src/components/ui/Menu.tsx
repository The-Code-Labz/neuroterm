import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

interface MenuProps {
  items: MenuItem[];
  label?: string;
}

/** Overflow ("kebab") menu used to move secondary row actions (edit/delete)
 * out of hover-only affordances and into a keyboard-reachable control. */
export default function Menu({ items, label = 'More actions' }: MenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-10 h-10 rounded-md text-ink-secondary hover:bg-surface3 hover:text-ink transition-colors duration-140"
      >
        <MoreVertical size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full mt-1 w-44 rounded-md border border-edge bg-surface2 shadow-window-unfocused py-1 z-30 animate-fade-in"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); item.onSelect(); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-control text-left transition-colors duration-140 ${
                item.danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-surface3'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
