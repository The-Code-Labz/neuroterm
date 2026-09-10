import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

const MENU_WIDTH = 176; // w-44
const MENU_MARGIN = 4; // mt-1 / mb-1

/** Overflow ("kebab") menu used to move secondary row actions (edit/delete)
 * out of hover-only affordances and into a keyboard-reachable control.
 *
 * Rendered via portal into document.body: the trigger commonly sits inside a
 * `overflow-hidden` rounded list container (see ConnectionList/CredentialsPage),
 * which clips an in-flow `absolute` dropdown for rows near the container's
 * edge — most visibly the last row. Portaling + fixed positioning against the
 * trigger's viewport rect sidesteps that clipping entirely. */
export default function Menu({ items, label = 'More actions' }: MenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? items.length * 36 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + MENU_MARGIN && rect.top > menuHeight + MENU_MARGIN;
    setCoords({
      top: openUp ? rect.top - MENU_MARGIN : rect.bottom + MENU_MARGIN,
      left: Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MENU_MARGIN),
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    const onReposition = () => reposition();
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={{
              position: 'fixed',
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
              left: Math.max(coords.left, MENU_MARGIN),
              width: MENU_WIDTH,
            }}
            className="rounded-md border border-edge bg-surface2 shadow-window-unfocused py-1 z-50 animate-fade-in"
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
          </div>,
          document.body
        )}
    </div>
  );
}
