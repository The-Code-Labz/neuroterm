import type { ReactNode } from 'react';

interface InventoryRowProps {
  glyph: ReactNode;
  title: string;
  meta: ReactNode;
  actions: ReactNode;
}

/** Divided operational row — replaces the old card-grid treatment for
 * connections/credentials. No card chrome around each row; rows are
 * separated by a hairline divider on `surface-1`. */
export default function InventoryRow({ glyph, title, meta, actions }: InventoryRowProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 sm:py-4 border-b border-edge-subtle last:border-b-0">
      <div className="flex-shrink-0 w-8 h-8 rounded-md bg-surface2 flex items-center justify-center text-ink-secondary">
        {glyph}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-body text-ink-strong truncate">{title}</div>
        <div className="mt-0.5 text-meta text-ink-secondary flex flex-wrap items-center gap-x-2 gap-y-0.5">{meta}</div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-1.5">{actions}</div>
    </div>
  );
}
