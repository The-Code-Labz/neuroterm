import { type ReactNode, useRef } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  size?: 'md' | 'sm';
}

/** A real two-option (or more) segmented control: `role="radiogroup"` of
 * `role="radio"` buttons with roving tabindex and arrow-key navigation. */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  ...aria
}: SegmentedControlProps<T>): JSX.Element {
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = options.findIndex((o) => o.value === value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = options[(idx + 1) % options.length];
      onChange(next.value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = options[(idx - 1 + options.length) % options.length];
      onChange(prev.value);
    }
  };

  const pad = size === 'sm' ? 'py-1.5 px-2.5 text-meta' : 'py-2 px-3 text-control';

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={aria['aria-label']}
      onKeyDown={onKeyDown}
      className="flex gap-1 p-1 rounded-md bg-surface1 border border-edge-subtle"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded font-sans transition-colors duration-140 ${pad} ${
              active ? 'bg-surface3 text-ink-strong' : 'text-ink-secondary hover:text-ink'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
