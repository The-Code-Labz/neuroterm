import { useCallback, useRef } from 'react';
import { Rnd } from 'react-rnd';
import { Terminal as TerminalIcon, Wifi, WifiOff, Loader, Minus, Square, Copy, X } from 'lucide-react';
import XtermPane from '../terminal/XtermPane';
import { useSessionStore, windowKey, type TerminalTab, type WindowLayout } from '../../store/session-store';

const MIN_WIDTH = 360;
const MIN_HEIGHT = 220;

function StatusDot({ status }: { status: TerminalTab['status'] }): JSX.Element {
  if (status === 'connected')    return <Wifi size={11} className="text-neuro-green" />;
  if (status === 'reconnecting') return <Loader size={11} className="text-neuro-yellow animate-spin" />;
  if (status === 'disconnected') return <WifiOff size={11} className="text-neuro-red" />;
  return <Loader size={11} className="text-gray-400 animate-spin" />;
}

interface TerminalWindowProps {
  tab: TerminalTab;
  layout: WindowLayout;
  isFocused: boolean;
  onClose: (id: string) => void;
  canvasSize: { width: number; height: number };
}

export default function TerminalWindow({ tab, layout, isFocused, onClose, canvasSize }: TerminalWindowProps): JSX.Element | null {
  const key = windowKey(tab);
  const setWindowLayout = useSessionStore((s) => s.setWindowLayout);
  const focusWindow = useSessionStore((s) => s.focusWindow);
  const preMaximize = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const bringToFront = useCallback(() => focusWindow(key), [focusWindow, key]);

  const toggleMaximize = useCallback(() => {
    if (layout.maximized) {
      const prev = preMaximize.current ?? { x: 60, y: 60, width: 720, height: 460 };
      setWindowLayout(key, { ...prev, maximized: false });
    } else {
      preMaximize.current = { x: layout.x, y: layout.y, width: layout.width, height: layout.height };
      setWindowLayout(key, { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height, maximized: true });
    }
    bringToFront();
  }, [layout, setWindowLayout, key, canvasSize, bringToFront]);

  const minimize = useCallback(() => {
    setWindowLayout(key, { minimized: true });
  }, [setWindowLayout, key]);

  if (layout.minimized) return null;

  return (
    <Rnd
      size={{ width: layout.width, height: layout.height }}
      position={{ x: layout.x, y: layout.y }}
      minWidth={MIN_WIDTH}
      minHeight={MIN_HEIGHT}
      bounds="parent"
      dragHandleClassName="neurodesk-drag-handle"
      disableDragging={layout.maximized}
      enableResizing={!layout.maximized}
      style={{ zIndex: layout.zIndex }}
      onDragStart={bringToFront}
      onDragStop={(_e, d) => setWindowLayout(key, { x: d.x, y: d.y })}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        setWindowLayout(key, {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: pos.x,
          y: pos.y,
        })
      }
      className="pointer-events-auto"
    >
      <div
        onMouseDown={bringToFront}
        className={`flex flex-col w-full h-full rounded-lg overflow-hidden border shadow-2xl bg-neuro-bg transition-[border-color] ${
          isFocused ? 'border-neuro-cyan/60 shadow-neuro-cyan/10' : 'border-neuro-border'
        }`}
      >
        {/* Kasm-style title bar */}
        <div
          className={`neurodesk-drag-handle flex items-center gap-2 px-2.5 py-1.5 cursor-move select-none border-b ${
            isFocused ? 'bg-gradient-to-b from-[#1c2530] to-[#161b22] border-neuro-cyan/30' : 'bg-neuro-panel border-neuro-border'
          }`}
          onDoubleClick={toggleMaximize}
        >
          <TerminalIcon size={13} className={isFocused ? 'text-neuro-cyan' : 'text-gray-500'} />
          <StatusDot status={tab.status} />
          <span className="text-xs font-mono text-gray-200 truncate">{tab.title}</span>
          <span className="text-[10px] font-mono text-gray-600 truncate">{tab.username}@{tab.host}</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={minimize}
              className="p-1 rounded hover:bg-neuro-yellow/20 text-gray-400 hover:text-neuro-yellow transition-colors"
              title="Minimize"
            >
              <Minus size={12} />
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={toggleMaximize}
              className="p-1 rounded hover:bg-neuro-green/20 text-gray-400 hover:text-neuro-green transition-colors"
              title={layout.maximized ? 'Restore' : 'Maximize'}
            >
              {layout.maximized ? <Copy size={11} /> : <Square size={11} />}
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onClose(tab.id)}
              className="p-1 rounded hover:bg-neuro-red/20 text-gray-400 hover:text-neuro-red transition-colors"
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0">
          <XtermPane tabId={tab.id} sessionId={tab.sessionId} active />
        </div>
      </div>
    </Rnd>
  );
}
