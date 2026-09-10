import { useId, cloneElement, type ReactElement } from 'react';

interface FieldProps {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
}

/**
 * Labels a single control and wires up helper/error text via
 * `aria-describedby` + `aria-invalid` so assistive tech announces both.
 */
export default function Field({ label, required, helper, error, children }: FieldProps): JSX.Element {
  const inputId = useId();
  const helperId = useId();
  const errorId = useId();
  const describedBy = [helper ? helperId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={inputId} className="block text-label text-ink-secondary mb-1.5">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      {cloneElement(children, {
        id: inputId,
        'aria-describedby': describedBy,
        'aria-invalid': Boolean(error),
      })}
      {helper && !error && (
        <p id={helperId} className="mt-1.5 text-meta text-ink-muted">
          {helper}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-meta text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
