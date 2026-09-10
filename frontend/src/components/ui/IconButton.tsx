import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Tooltip from './Tooltip';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: 'ghost' | 'danger';
  size?: 'md' | 'sm';
}

const sizes = {
  md: 'w-10 h-10',
  sm: 'w-8 h-8',
};

const variants = {
  ghost: 'text-ink-secondary hover:bg-surface3 hover:text-ink',
  danger: 'text-ink-secondary hover:bg-danger/10 hover:text-danger',
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', className = '', type = 'button', ...props },
  ref
) {
  return (
    <Tooltip label={label}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={`inline-flex items-center justify-center rounded-md transition-colors duration-140 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
        {...props}
      >
        {icon}
      </button>
    </Tooltip>
  );
});

export default IconButton;
