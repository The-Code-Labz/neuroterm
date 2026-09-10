import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { AlertTriangle } from 'lucide-react';
import { useTerminalSocket, type SocketStatus } from '../../hooks/useTerminalSocket';
import { useSessionStore } from '../../store/session-store';
import { announce } from '../../store/live-region-store';
import StatusIndicator from '../ui/StatusIndicator';

interface XtermPaneProps {
  tabId: string;
  sessionId: string;
  active: boolean;
  /** 'tab' renders its own status bar (Tabs view). 'window' suppresses it —
   * NeuroDesk's title bar already carries connection status, and rendering
   * both was duplicate chrome. */
  chrome?: 'tab' | 'window';
  title?: string;
}

const XTERM_THEME = {
  background: '#090B0D',
  foreground: '#D8DEE4',
  cursor: '#79D3C4',
  cursorAccent: '#090B0D',
  selectionBackground: 'rgba(103, 199, 184, 0.24)',
  black: '#30373E',
  red: '#E78284',
  green: '#8FCB8F',
  yellow: '#E5C07B',
  blue: '#7AA2D6',
  magenta: '#B998D6',
  cyan: '#6FC3BE',
  white: '#D5D9DE',
  brightBlack: '#46525D',
  brightRed: '#E78284',
  brightGreen: '#8FCB8F',
  brightYellow: '#E5C07B',
  brightBlue: '#7AA2D6',
  brightMagenta: '#B998D6',
  brightCyan: '#6FC3BE',
  brightWhite: '#F2F5F7',
};

export default function XtermPane({ tabId, sessionId, active, chrome = 'tab', title }: XtermPaneProps): JSX.Element {
  const containerRef  = useRef<HTMLDivElement>(null);
  const termRef       = useRef<Terminal | null>(null);
  const fitAddonRef   = useRef<FitAddon | null>(null);
  const [terminal, setTerminal]   = useState<Terminal | null>(null);
  const [status, setStatus]       = useState<SocketStatus>('connecting');
  const prevStatus                = useRef<SocketStatus>('connecting');
  const updateTabStatus           = useSessionStore((s) => s.updateTabStatus);

  const onStatusChange = useCallback((s: SocketStatus) => {
    setStatus(s);
    updateTabStatus(tabId, s === 'connected' ? 'connected' : s === 'reconnecting' ? 'reconnecting' : s === 'disconnected' ? 'disconnected' : 'connecting');
    if (prevStatus.current !== s) {
      const label = title ? `${title} ` : '';
      if (s === 'connected') announce(`${label}connected`);
      else if (s === 'reconnecting') announce(`${label}reconnecting — tmux session is still running`);
      else if (s === 'disconnected') announce(`${label}disconnected`);
      prevStatus.current = s;
    }
  }, [tabId, title, updateTabStatus]);

  // NOTE: `enabled` is intentionally NOT tied to `active`. All panes stay
  // mounted with only the active one visible (see TerminalPage), and the
  // backing tmux/SSH session should keep streaming in the background too —
  // tearing the socket down on every tab switch forced a fresh pty/SSH
  // reattach (and a fresh resize negotiation) each time, which was the
  // actual cause of scrollback getting reflowed/mangled on tab switches.
  const { sendInput, sendResize } = useTerminalSocket({
    sessionId,
    terminal,
    onStatusChange,
    enabled: true,
  });

  // Mount xterm
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: XTERM_THEME,
      allowTransparency: false,
      scrollback: 5000,
    });

    const fitAddon      = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    // xterm.js does NOT special-case Ctrl+C/Ctrl+V by default — every
    // keypress is fed straight to the pty, so Ctrl+C always sends SIGINT
    // (and preventDefault()s the keydown, which also blocks the browser's
    // native "copy" command tied to that same shortcut) even when the user
    // has text selected, and Ctrl+V never reaches the native paste flow.
    // Fall back to the browser's own clipboard handling for the
    // conventional copy/paste chords instead of forwarding them to the
    // shell as input.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      const mod = event.ctrlKey || event.metaKey;
      // Ctrl/Cmd+Shift+C or Ctrl/Cmd+C with an active selection → copy.
      if (mod && (event.key === 'c' || event.key === 'C') && (event.shiftKey || term.hasSelection())) {
        return false;
      }
      // Ctrl/Cmd+Shift+V or Ctrl/Cmd+V → paste.
      if (mod && (event.key === 'v' || event.key === 'V')) {
        return false;
      }
      return true;
    });

    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    termRef.current   = term;
    fitAddonRef.current = fitAddon;
    setTerminal(term);

    return () => {
      term.dispose();
      termRef.current    = null;
      fitAddonRef.current = null;
      setTerminal(null);
    };
  }, []);

  // Wire input
  useEffect(() => {
    if (!terminal) return;
    const dispose = terminal.onData((data) => sendInput(data));
    return () => dispose.dispose();
  }, [terminal, sendInput]);

  // Resize observer. Inactive panes are kept mounted with `display: none`
  // (see TerminalPage), which collapses them to a 0x0 box. FitAddon.fit()
  // on a 0x0 container computes the smallest possible grid (as low as
  // 2 cols x 1 row) and, since that got pushed straight to the pty/tmux
  // session, forced an immediate reflow of the remote screen down to ~2
  // columns wide — mangling wrapped lines and scrollback. Only ever fit
  // (and only ever push a resize to the backend) while the pane is both
  // active and actually has real on-screen dimensions.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (!active) return;
      if (!fitAddonRef.current || !termRef.current) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        fitAddonRef.current.fit();
        sendResize(termRef.current.cols, termRef.current.rows);
      } catch { /* ignore */ }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [active, sendResize]);

  // Re-fit on activation (tab regains focus / becomes visible again)
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const timer = setTimeout(() => {
      if (!fitAddonRef.current || !termRef.current || !container) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        fitAddonRef.current.fit();
        sendResize(termRef.current.cols, termRef.current.rows);
      } catch { /* ignore */ }
    }, 50);
    return () => clearTimeout(timer);
  }, [active, sendResize]);

  const showReconnectBanner = chrome === 'tab' && (status === 'reconnecting' || status === 'connecting');

  return (
    <div className="relative w-full h-full bg-termbg" style={{ display: active ? 'flex' : 'none', flexDirection: 'column' }}>
      {chrome === 'tab' && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 h-7 bg-surface2 border-b border-edge-subtle text-meta">
          <StatusIndicator status={status} showLabel />
        </div>
      )}

      {/* Terminal — never covered by a blocking overlay; the last rendered
       * frame stays visible through a reconnect. */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {/* Slim, non-blocking reconnect banner instead of a blurred overlay. */}
      {showReconnectBanner && (
        <div className="absolute left-2 right-2 bottom-2 flex items-center gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/30 text-meta text-warning pointer-events-none">
          <AlertTriangle size={13} strokeWidth={1.75} className="flex-shrink-0" />
          {status === 'reconnecting' ? 'Reconnecting — tmux session is still running.' : 'Connecting…'}
        </div>
      )}
    </div>
  );
}
