import { useRef } from 'react';
import { X, Terminal } from 'lucide-react';
import { useSessionStore, type TerminalTab } from '../../store/session-store';
import StatusIndicator from '../ui/StatusIndicator';
import Tooltip from '../ui/Tooltip';

interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export default function TerminalTabs({ tabs, activeTabId, onSelect, onClose }: TerminalTabsProps): JSX.Element {
  const stripRef = useRef<HTMLDivElement>(null);

  // Convert vertical wheel/trackpad scroll into horizontal scroll so a wide
  // strip of session tabs can be browsed without a shift-modifier.
  const onWheel = (e: React.WheelEvent) => {
    if (e.deltaY === 0 || !stripRef.current) return;
    stripRef.current.scrollLeft += e.deltaY;
  };

  if (tabs.length === 0) {
    return (
      <div className="flex items-center h-[38px] px-3 bg-surface1 border-b border-edge-subtle">
        <span className="text-meta text-ink-muted">No open sessions — connect from Connections</span>
      </div>
    );
  }

  return (
    <div
      ref={stripRef}
      onWheel={onWheel}
      role="tablist"
      aria-label="Terminal sessions"
      className="flex items-stretch h-[38px] bg-surface1 border-b border-edge-subtle overflow-x-auto"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tab.id); } }}
            className={`group relative flex items-center gap-2 px-3 min-w-[160px] max-w-[240px] cursor-pointer select-none border-r border-edge-subtle transition-colors duration-140 ${
              isActive ? 'bg-surface2 text-ink-strong' : 'bg-surface1 text-ink-secondary hover:bg-surface2/60 hover:text-ink'
            }`}
          >
            {isActive && <span className="absolute top-0 left-0 right-0 h-0.5 bg-accent" aria-hidden="true" />}
            <Terminal size={13} strokeWidth={1.75} className="flex-shrink-0" />
            <StatusIndicator status={tab.status} size={10} />
            <span className="flex-1 min-w-0 truncate text-control">{tab.title}</span>
            <span className="hidden sm:inline flex-shrink-0 text-meta-mono font-technical text-ink-muted truncate max-w-[64px]">
              {tab.tmuxSession}
            </span>
            <Tooltip label="Close session">
              <button
                type="button"
                tabIndex={isActive ? 0 : -1}
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                className={`flex-shrink-0 p-0.5 rounded transition-colors duration-140 hover:bg-danger/10 hover:text-danger ${
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                }`}
                aria-label={`Close ${tab.title}`}
              >
                <X size={12} strokeWidth={1.75} />
              </button>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
