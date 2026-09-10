import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-sans text-control ' +
  'transition-colors duration-140 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none disabled:active:translate-y-0';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'bg-surface2 border border-edge text-ink hover:bg-surface3',
  ghost: 'bg-transparent text-ink-secondary hover:bg-surface2 hover:text-ink',
  danger: 'bg-transparent text-ink-secondary hover:bg-danger/10 hover:text-danger',
  // Solid danger is reserved for the final confirmation step only.
  'danger-solid': 'bg-danger text-accent-ink hover:brightness-110',
};

const sizes = {
  md: 'h-10 px-4',
  sm: 'h-8 px-3 text-meta',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className = '', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});

export default Button;
