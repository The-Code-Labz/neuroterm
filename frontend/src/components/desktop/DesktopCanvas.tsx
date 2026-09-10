import { useEffect, useRef, useState } from 'react';
import { useSessionStore, windowKey, type TerminalTab } from '../../store/session-store';
import TerminalWindow from './TerminalWindow';
import Taskbar from './Taskbar';

interface DesktopCanvasProps {
  tabs: TerminalTab[];
  onCloseTab: (id: string) => void;
}

const CASCADE_STEP = 32;
const DEFAULT_SIZE = { width: 720, height: 460 };

export default function DesktopCanvas({ tabs, onCloseTab }: DesktopCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1024, height: 640 });
  const windowLayouts = useSessionStore((s) => s.windowLayouts);
  const setWindowLayout = useSessionStore((s) => s.setWindowLayout);
  const focusedWindowKey = useSessionStore((s) => s.focusedWindowKey);
  const clearFocus = useSessionStore((s) => s.clearFocus);
  const focusWindow = useSessionStore((s) => s.focusWindow);

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

  // Keep maximized windows filling the canvas if the browser/canvas resizes.
  useEffect(() => {
    tabs.forEach((tab) => {
      const key = windowKey(tab);
      const layout = windowLayouts[key];
      if (layout?.maximized && (layout.width !== canvasSize.width || layout.height !== canvasSize.height)) {
        setWindowLayout(key, { width: canvasSize.width, height: canvasSize.height, x: 0, y: 0 });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize]);

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
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs font-mono text-gray-600">NeuroDesk — connect from the sidebar to open a window</p>
          </div>
        )}
      </div>
      <Taskbar tabs={tabs} onCloseTab={onCloseTab} />
    </div>
  );
}
