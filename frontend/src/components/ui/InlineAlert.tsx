import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import Button from './Button';

type AlertVariant = 'error' | 'warning' | 'info' | 'success';

interface InlineAlertProps {
  variant: AlertVariant;
  message: string;
  onRetry?: () => void;
  className?: string;
}

const CONFIG: Record<AlertVariant, { icon: typeof Info; color: string; bg: string }> = {
  error: { icon: XCircle, color: 'text-danger', bg: 'bg-danger/10 border-danger/30' },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
  info: { icon: Info, color: 'text-info', bg: 'bg-info/10 border-info/30' },
  success: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10 border-success/30' },
};

/** Replaces `alert()` for API errors — an inline banner with a specific
 * message and an optional Retry action. */
export default function InlineAlert({ variant, message, onRetry, className = '' }: InlineAlertProps): JSX.Element {
  const { icon: Icon, color, bg } = CONFIG[variant];
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-meta ${bg} ${className}`}>
      <Icon size={16} strokeWidth={1.75} className={`flex-shrink-0 mt-0.5 ${color}`} />
      <span className="flex-1 text-ink">{message}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
