import { useCallback, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { Terminal as TerminalIcon, Minus, Square, Copy, X } from 'lucide-react';
import XtermPane from '../terminal/XtermPane';
import StatusIndicator from '../ui/StatusIndicator';
import Tooltip from '../ui/Tooltip';
import { useSessionStore, windowKey, tabIdentity, type TerminalTab, type WindowLayout } from '../../store/session-store';

const MIN_WIDTH = 360;
const MIN_HEIGHT = 220;

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
  const [interacting, setInteracting] = useState(false);

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
      onDragStart={() => { bringToFront(); setInteracting(true); }}
      onDragStop={(_e, d) => { setWindowLayout(key, { x: d.x, y: d.y }); setInteracting(false); }}
      onResizeStart={() => setInteracting(true)}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        setWindowLayout(key, { width: ref.offsetWidth, height: ref.offsetHeight, x: pos.x, y: pos.y });
        setInteracting(false);
      }}
      className="pointer-events-auto"
    >
      <div
        onMouseDown={bringToFront}
        className={`neurodesk-window group/win relative flex flex-col w-full h-full overflow-hidden border transition-[border-color,box-shadow] duration-140 ${
          layout.maximized ? '' : 'rounded-lg'
        } ${interacting ? 'is-interacting' : ''} ${
          isFocused
            ? 'border-[rgba(103,199,184,0.72)] shadow-window'
            : 'border-edge shadow-window-unfocused'
        } bg-canvas`}
      >
        {/* 2px accent keyline across the top edge when focused */}
        {isFocused && <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent z-10" aria-hidden="true" />}

        {/* Title bar */}
        <div
          className="neurodesk-drag-handle flex items-center gap-2 px-2.5 h-[38px] flex-shrink-0 cursor-move select-none border-b border-edge-subtle bg-surface2"
          onDoubleClick={toggleMaximize}
        >
          <TerminalIcon size={16} strokeWidth={1.75} className={isFocused ? 'text-accent' : 'text-ink-muted'} />
          <span className={`text-control truncate ${isFocused ? 'text-ink-strong' : 'text-ink-secondary'}`}>{tab.title}</span>
          <StatusIndicator status={tab.status} size={11} />
          <span className="text-meta-mono font-technical text-ink-muted truncate ml-1">
            {tabIdentity(tab)}
          </span>
          <div className="ml-auto flex items-center gap-0.5" onMouseDown={(e) => e.stopPropagation()}>
            <Tooltip label="Minimize">
              <button
                onClick={minimize}
                aria-label="Minimize"
                className="flex items-center justify-center w-8 h-8 rounded text-ink-muted hover:bg-surface3 hover:text-ink transition-colors duration-140"
              >
                <Minus size={14} strokeWidth={1.75} />
              </button>
            </Tooltip>
            <Tooltip label={layout.maximized ? 'Restore' : 'Maximize'}>
              <button
                onClick={toggleMaximize}
                aria-label={layout.maximized ? 'Restore' : 'Maximize'}
                className="flex items-center justify-center w-8 h-8 rounded text-ink-muted hover:bg-surface3 hover:text-ink transition-colors duration-140"
              >
                {layout.maximized ? <Copy size={13} strokeWidth={1.75} /> : <Square size={13} strokeWidth={1.75} />}
              </button>
            </Tooltip>
            <Tooltip label="Close">
              <button
                onClick={() => onClose(tab.id)}
                aria-label="Close"
                className="flex items-center justify-center w-8 h-8 rounded text-ink-muted hover:bg-danger hover:text-accent-ink transition-colors duration-140"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0">
          <XtermPane tabId={tab.id} sessionId={tab.sessionId} active chrome="window" title={tab.title} />
        </div>

        {/* Discoverable resize corner mark — visual only, full invisible hit
         * handles are still provided by react-rnd underneath. */}
        {!layout.maximized && (
          <div
            className="neurodesk-resize-corner pointer-events-none absolute bottom-0.5 right-0.5 w-2 h-2 border-b-2 border-r-2 border-edge-strong rounded-br-sm"
            aria-hidden="true"
          />
        )}
      </div>
    </Rnd>
  );
}
