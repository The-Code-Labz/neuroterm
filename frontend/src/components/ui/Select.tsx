import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = '', children, ...props },
  ref
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={`w-full h-10 appearance-none rounded-md bg-surface2 border border-edge pl-3 pr-9 text-control text-ink
          outline-none transition-colors duration-140
          hover:border-edge-strong
          focus:border-accent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={14} strokeWidth={1.75} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
    </div>
  );
});

export default Select;
