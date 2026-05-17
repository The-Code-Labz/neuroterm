import { X, Terminal, Wifi, WifiOff, Loader } from 'lucide-react';
import { useSessionStore, type TerminalTab } from '../../store/session-store';

interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

function StatusDot({ status }: { status: TerminalTab['status'] }): JSX.Element {
  if (status === 'connected')    return <Wifi size={10} className="text-neuro-green" />;
  if (status === 'reconnecting') return <Loader size={10} className="text-neuro-yellow animate-spin" />;
  if (status === 'disconnected') return <WifiOff size={10} className="text-neuro-red" />;
  return <Loader size={10} className="text-gray-400 animate-spin" />;
}

export default function TerminalTabs({ tabs, activeTabId, onSelect, onClose }: TerminalTabsProps): JSX.Element {
  return (
    <div className="flex items-center gap-1 px-2 bg-neuro-panel border-b border-neuro-border overflow-x-auto min-h-[40px]">
      {tabs.length === 0 && (
        <span className="text-xs text-gray-500 font-mono px-2">No open sessions — connect from the sidebar</span>
      )}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-t text-xs font-mono whitespace-nowrap transition-colors group
            ${tab.id === activeTabId
              ? 'bg-neuro-bg text-neuro-cyan border border-b-0 border-neuro-border'
              : 'text-gray-400 hover:text-gray-200 hover:bg-neuro-bg/50'
            }`}
        >
          <Terminal size={12} />
          <StatusDot status={tab.status} />
          <span>{tab.title}</span>
          <span className="text-gray-600 text-[10px]">{tab.tmuxSession}</span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClose(tab.id); } }}
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-neuro-red transition-opacity rounded p-0.5 hover:bg-neuro-red/10"
          >
            <X size={10} />
          </span>
        </button>
      ))}
    </div>
  );
}
