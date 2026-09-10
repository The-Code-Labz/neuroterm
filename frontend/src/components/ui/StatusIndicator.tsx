import { Wifi, WifiOff, Loader } from 'lucide-react';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const CONFIG: Record<ConnectionStatus, { icon: typeof Wifi; color: string; label: string }> = {
  connected: { icon: Wifi, color: 'text-success', label: 'Connected' },
  reconnecting: { icon: Loader, color: 'text-warning', label: 'Reconnecting' },
  disconnected: { icon: WifiOff, color: 'text-danger', label: 'Disconnected' },
  connecting: { icon: Loader, color: 'text-ink-muted', label: 'Connecting' },
};

interface StatusIndicatorProps {
  status: ConnectionStatus;
  size?: number;
  showLabel?: boolean;
  className?: string;
}

/** Status is always icon + text, never color alone (per accessibility spec). */
export default function StatusIndicator({ status, size = 12, showLabel = false, className = '' }: StatusIndicatorProps): JSX.Element {
  const { icon: Icon, color, label } = CONFIG[status];
  const spinning = status === 'connecting' || status === 'reconnecting';

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={label}>
      <Icon size={size} strokeWidth={1.75} className={`${color} ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
      {showLabel ? <span className={`text-meta ${color}`}>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}
