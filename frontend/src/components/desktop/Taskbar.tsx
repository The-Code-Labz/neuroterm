import { Terminal as TerminalIcon, Wifi, WifiOff, Loader, X } from 'lucide-react';
import { useSessionStore, windowKey, type TerminalTab } from '../../store/session-store';

function StatusDot({ status }: { status: TerminalTab['status'] }): JSX.Element {
  if (status === 'connected')    return <Wifi size={10} className="text-neuro-green" />;
  if (status === 'reconnecting') return <Loader size={10} className="text-neuro-yellow animate-spin" />;
  if (status === 'disconnected') return <WifiOff size={10} className="text-neuro-red" />;
  return <Loader size={10} className="text-gray-400 animate-spin" />;
}

interface TaskbarProps {
  tabs: TerminalTab[];
  onCloseTab: (id: string) => void;
}

export default function Taskbar({ tabs, onCloseTab }: TaskbarProps): JSX.Element {
  const windowLayouts = useSessionStore((s) => s.windowLayouts);
  const setWindowLayout = useSessionStore((s) => s.setWindowLayout);
  const focusWindow = useSessionStore((s) => s.focusWindow);

  const restore = (tab: TerminalTab): void => {
    const key = windowKey(tab);
    setWindowLayout(key, { minimized: false });
    focusWindow(key);
  };

  return (
    <div className="flex items-center gap-1.5 px-2.5 h-11 bg-neuro-panel/95 backdrop-blur border-t border-neuro-border overflow-x-auto flex-shrink-0">
      {tabs.length === 0 && (
        <span className="text-[11px] text-gray-600 font-mono px-1">NeuroDesk — no open windows</span>
      )}
      {tabs.map((tab) => {
        const layout = windowLayouts[windowKey(tab)];
        const minimized = layout?.minimized ?? false;
        return (
          <button
            key={tab.id}
            onClick={() => restore(tab)}
            className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono whitespace-nowrap transition-colors border ${
              minimized
                ? 'bg-neuro-bg/60 text-gray-400 border-neuro-border hover:text-gray-200 hover:border-neuro-cyan/30'
                : 'bg-neuro-cyan/10 text-neuro-cyan border-neuro-cyan/30'
            }`}
          >
            <TerminalIcon size={11} />
            <StatusDot status={tab.status} />
            <span>{tab.title}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onCloseTab(tab.id); } }}
              className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-neuro-red transition-opacity rounded p-0.5"
            >
              <X size={10} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
