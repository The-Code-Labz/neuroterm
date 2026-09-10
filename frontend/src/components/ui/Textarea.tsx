import { forwardRef, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = '', mono = true, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={`w-full min-h-[136px] rounded-md bg-surface2 border border-edge px-3 py-2.5 text-control text-ink placeholder:text-ink-muted
        outline-none transition-colors duration-140 resize-none
        hover:border-edge-strong
        focus:border-accent
        disabled:opacity-50 disabled:cursor-not-allowed
        aria-invalid:border-danger
        ${mono ? 'font-technical' : ''} ${className}`}
      {...props}
    />
  );
});

export default Textarea;
