import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', mono = false, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`w-full h-10 rounded-md bg-surface2 border border-edge px-3 text-control text-ink placeholder:text-ink-muted
        outline-none transition-colors duration-140
        hover:border-edge-strong
        focus:border-accent
        disabled:opacity-50 disabled:cursor-not-allowed
        read-only:bg-surface1 read-only:text-ink-secondary
        aria-invalid:border-danger
        ${mono ? 'font-technical' : ''} ${className}`}
      {...props}
    />
  );
});

export default Input;
