import { cloneElement, useId, type ReactElement } from 'react';

interface TooltipProps {
  label: string;
  children: ReactElement;
  side?: 'top' | 'bottom';
}

/**
 * Minimal CSS-driven tooltip. Native `title` attributes never appear on
 * keyboard focus in any browser, which the design brief explicitly requires
 * ("Tooltips must also appear on keyboard focus") — so this shows on both
 * `:hover` and `:focus-within` of the wrapping span via group utilities.
 */
export default function Tooltip({ label, children, side = 'bottom' }: TooltipProps): JSX.Element {
  const id = useId();
  const position = side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5';

  return (
    <span className="relative inline-flex group/tooltip">
      {cloneElement(children, { 'aria-describedby': id } as Record<string, unknown>)}
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${position} z-50 whitespace-nowrap rounded-sm bg-surface3 border border-edge px-2 py-1 text-meta text-ink opacity-0 shadow-window-unfocused transition-opacity duration-140 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100`}
      >
        {label}
      </span>
    </span>
  );
}
