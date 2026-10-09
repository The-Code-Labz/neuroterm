import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Renders a thin divider above this item instead of the item itself continuing the previous group. */
  separatorBefore?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface ContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
}

const MENU_WIDTH = 220;
const MENU_MARGIN = 4;

/** Right-click context menu, positioned at the cursor rather than anchored to
 * a trigger element (unlike `Menu.tsx`, which opens below a button). Portaled
 * to `document.body` and flipped to stay inside the viewport, same pattern as
 * `Menu.tsx` uses for its own clipping problem. Caller owns the open/closed
 * state (via `state`) so a single instance can serve every row in a tree —
 * see FileTree, which keeps one `<ContextMenu>` mounted and just swaps
 * `state.items` per right-click target. */
export default function ContextMenu({ state, onClose }: ContextMenuProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!state) { setPos(null); return; }
    const menuHeight = menuRef.current?.offsetHeight ?? state.items.length * 32 + 8;
    const top = Math.min(state.y, window.innerHeight - menuHeight - MENU_MARGIN);
    const left = Math.min(state.x, window.innerWidth - MENU_WIDTH - MENU_MARGIN);
    setPos({ top: Math.max(MENU_MARGIN, top), left: Math.max(MENU_MARGIN, left) });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('contextmenu', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('contextmenu', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [state, onClose]);

  if (!state || !pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH }}
      className="rounded-md border border-edge bg-surface2 shadow-window py-1 z-50 animate-fade-in"
    >
      {state.items.map((item, i) => (
        <div key={`${item.label}-${i}`}>
          {item.separatorBefore && <div className="my-1 border-t border-edge-subtle" />}
          <button
            role="menuitem"
            type="button"
            disabled={item.disabled}
            onClick={() => { onClose(); item.onSelect(); }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-control text-left transition-colors duration-140 disabled:opacity-40 disabled:pointer-events-none ${
              item.danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-surface3'
            }`}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
