import { useRef } from 'react';
import { Terminal as TerminalIcon, X, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore, windowKey, type TerminalTab } from '../../store/session-store';
import StatusIndicator from '../ui/StatusIndicator';
import Tooltip from '../ui/Tooltip';

interface TaskbarProps {
  tabs: TerminalTab[];
  onCloseTab: (id: string) => void;
  /** In compact (<900px) NeuroDesk mode there is always exactly one visible
   * maximized session, so "minimize" has nowhere to go — clicking the
   * focused task is a no-op there instead of hiding the only pane. */
  compact?: boolean;
}

export default function Taskbar({ tabs, onCloseTab, compact = false }: TaskbarProps): JSX.Element {
  const windowLayouts = useSessionStore((s) => s.windowLayouts);
  const setWindowLayout = useSessionStore((s) => s.setWindowLayout);
  const focusWindow = useSessionStore((s) => s.focusWindow);
  const focusedWindowKey = useSessionStore((s) => s.focusedWindowKey);
  const stripRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const connectedCount = tabs.filter((t) => t.status === 'connected').length;

  // Desktop convention: clicking the already-focused, visible task minimizes
  // it; clicking any other task (minimized or unfocused) restores + focuses.
  const handleTaskClick = (tab: TerminalTab) => {
    const key = windowKey(tab);
    const layout = windowLayouts[key];
    const isFocused = focusedWindowKey === key;
    if (compact) {
      focusWindow(key);
      return;
    }
    if (isFocused && !layout?.minimized) {
      setWindowLayout(key, { minimized: true });
      return;
    }
    setWindowLayout(key, { minimized: false });
    focusWindow(key);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.deltaY === 0 || !stripRef.current) return;
    stripRef.current.scrollLeft += e.deltaY;
  };

  return (
    <div className="flex items-center gap-2 h-12 px-2 bg-base border-t border-edge-subtle flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Left — mark + new session */}
      <div className="flex items-center gap-2 flex-shrink-0 pr-2 border-r border-edge-subtle">
        <span className="text-accent font-technical text-control hidden sm:inline">&gt;_</span>
        <Tooltip label="New session">
          <button
            onClick={() => navigate('/')}
            aria-label="New session"
            className="flex items-center justify-center w-8 h-8 rounded-md text-ink-secondary hover:bg-surface2 hover:text-ink transition-colors duration-140"
          >
            <Plus size={15} strokeWidth={1.75} />
          </button>
        </Tooltip>
      </div>

      {/* Center — task buttons */}
      <div ref={stripRef} onWheel={onWheel} className="flex-1 flex items-center gap-1.5 overflow-x-auto min-w-0">
        {tabs.length === 0 && <span className="text-meta text-ink-muted px-1">No open windows</span>}
        {tabs.map((tab) => {
          const layout = windowLayouts[windowKey(tab)];
          const minimized = layout?.minimized ?? false;
          const focused = focusedWindowKey === windowKey(tab) && !minimized;
          const state = focused ? 'focused' : minimized ? 'minimized' : 'visible';

          return (
            <div
              key={tab.id}
              className={`group relative flex items-center gap-1 flex-shrink-0 min-w-[140px] max-w-[220px] h-9 rounded-md transition-colors duration-140 ${
                state === 'focused' ? 'bg-surface3' : state === 'visible' ? 'bg-surface2' : 'bg-surface1'
              }`}
            >
              {focused && <span className="absolute bottom-0 left-1.5 right-1.5 h-0.5 bg-accent rounded-full" aria-hidden="true" />}
              <button
                onClick={() => handleTaskClick(tab)}
                className={`flex-1 min-w-0 flex items-center gap-1.5 pl-2.5 pr-1 h-full text-control text-left ${
                  state === 'focused' ? 'text-ink-strong' : state === 'visible' ? 'text-ink' : 'text-ink-secondary'
                }`}
              >
                <TerminalIcon size={13} strokeWidth={1.75} className="flex-shrink-0" />
                <StatusIndicator status={tab.status} size={10} />
                <span className="flex-1 min-w-0 truncate">{tab.title}</span>
              </button>
              <Tooltip label="Close session">
                <button
                  onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                  aria-label={`Close ${tab.title}`}
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 mr-0.5 rounded text-ink-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-danger/10 hover:text-danger transition-colors duration-140"
                >
                  <X size={12} strokeWidth={1.75} />
                </button>
              </Tooltip>
            </div>
          );
        })}
      </div>

      {/* Right — compact counts */}
      <div className="hidden sm:flex items-center gap-1 flex-shrink-0 pl-2 border-l border-edge-subtle text-meta-mono font-technical text-ink-muted">
        <span>{connectedCount}/{tabs.length} connected</span>
      </div>
    </div>
  );
}
