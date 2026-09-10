import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal as TerminalIcon, Plus } from 'lucide-react';
import { useSessionStore, windowKey, tabIdentity, type TerminalTab } from '../../store/session-store';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import TerminalWindow from './TerminalWindow';
import Taskbar from './Taskbar';
import XtermPane from '../terminal/XtermPane';
import StatusIndicator from '../ui/StatusIndicator';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';

interface DesktopCanvasProps {
  tabs: TerminalTab[];
  onCloseTab: (id: string) => void;
}

const CASCADE_STEP = 32;
const DEFAULT_SIZE = { width: 720, height: 460 };
// Freeform windows are desktop behavior only — below this, NeuroDesk
// collapses to a single maximized session with drag/resize disabled.
const COMPACT_QUERY = '(max-width: 899px)';

export default function DesktopCanvas({ tabs, onCloseTab }: DesktopCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1024, height: 640 });
  const windowLayouts = useSessionStore((s) => s.windowLayouts);
  const setWindowLayout = useSessionStore((s) => s.setWindowLayout);
  const focusedWindowKey = useSessionStore((s) => s.focusedWindowKey);
  const clearFocus = useSessionStore((s) => s.clearFocus);
  const focusWindow = useSessionStore((s) => s.focusWindow);
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const navigate = useNavigate();

  // Track available canvas size (used for maximize + cascade bounds).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep maximized windows filling the canvas if the browser/canvas resizes
  // — skipped in compact mode, which never touches stored geometry so it
  // can be restored untouched at a larger viewport.
  useEffect(() => {
    if (isCompact) return;
    tabs.forEach((tab) => {
      const key = windowKey(tab);
      const layout = windowLayouts[key];
      if (layout?.maximized && (layout.width !== canvasSize.width || layout.height !== canvasSize.height)) {
        setWindowLayout(key, { width: canvasSize.width, height: canvasSize.height, x: 0, y: 0 });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize, isCompact]);

  // Ensure every open tab has a layout — new tabs cascade from the
  // previous window's position instead of stacking exactly on top of it.
  useEffect(() => {
    const existingCount = Object.keys(windowLayouts).length;
    tabs.forEach((tab, i) => {
      const key = windowKey(tab);
      if (windowLayouts[key]) return;
      const slot = existingCount + i;
      const x = 40 + ((slot * CASCADE_STEP) % Math.max(1, canvasSize.width - DEFAULT_SIZE.width - 40));
      const y = 40 + ((slot * CASCADE_STEP) % Math.max(1, canvasSize.height - DEFAULT_SIZE.height - 40));
      setWindowLayout(key, { x, y, width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height, minimized: false, maximized: false });
      focusWindow(key);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  if (isCompact) {
    const focusedTab = tabs.find((t) => windowKey(t) === focusedWindowKey) ?? tabs[0];
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 neurodesk-grid">
          {focusedTab ? (
            <div className="flex flex-col h-full bg-canvas">
              <div className="flex items-center gap-2 h-[38px] px-3 flex-shrink-0 border-b border-edge-subtle bg-surface2">
                <TerminalIcon size={16} strokeWidth={1.75} className="text-accent" />
                <span className="text-control text-ink-strong truncate">{focusedTab.title}</span>
                <StatusIndicator status={focusedTab.status} size={11} />
                <span className="text-meta-mono font-technical text-ink-muted truncate ml-1">
                  {tabIdentity(focusedTab)}
                </span>
              </div>
              <div className="flex-1 min-h-0">
                <XtermPane tabId={focusedTab.id} sessionId={focusedTab.sessionId} active chrome="window" title={focusedTab.title} />
              </div>
            </div>
          ) : (
            <EmptyState
              className="h-full"
              icon={<TerminalIcon size={32} strokeWidth={1.5} />}
              title="NeuroDesk"
              description="Connect from Connections to open a session here."
              action={<Button variant="primary" onClick={() => navigate('/')}><Plus size={16} strokeWidth={1.75} /> New connection</Button>}
            />
          )}
        </div>
        <Taskbar tabs={tabs} onCloseTab={onCloseTab} compact />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={canvasRef}
        className="relative flex-1 overflow-hidden neurodesk-grid"
        onMouseDown={(e) => {
          if (e.target === canvasRef.current) clearFocus();
        }}
      >
        {tabs.map((tab) => {
          const key = windowKey(tab);
          const layout = windowLayouts[key];
          if (!layout) return null;
          return (
            <TerminalWindow
              key={tab.id}
              tab={tab}
              layout={layout}
              isFocused={focusedWindowKey === key}
              onClose={onCloseTab}
              canvasSize={canvasSize}
            />
          );
        })}
        {tabs.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyState
              icon={<TerminalIcon size={32} strokeWidth={1.5} />}
              title="NeuroDesk"
              description="Connect from Connections to open a window here."
              action={<Button variant="primary" onClick={() => navigate('/')}><Plus size={16} strokeWidth={1.75} /> New connection</Button>}
            />
          </div>
        )}
      </div>
      <Taskbar tabs={tabs} onCloseTab={onCloseTab} />
    </div>
  );
}
