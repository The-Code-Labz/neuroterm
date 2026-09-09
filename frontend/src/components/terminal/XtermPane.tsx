import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useTerminalSocket, type SocketStatus } from '../../hooks/useTerminalSocket';
import { useSessionStore } from '../../store/session-store';

interface XtermPaneProps {
  tabId: string;
  sessionId: string;
  active: boolean;
}

export default function XtermPane({ tabId, sessionId, active }: XtermPaneProps): JSX.Element {
  const containerRef  = useRef<HTMLDivElement>(null);
  const termRef       = useRef<Terminal | null>(null);
  const fitAddonRef   = useRef<FitAddon | null>(null);
  const [terminal, setTerminal]   = useState<Terminal | null>(null);
  const [status, setStatus]       = useState<SocketStatus>('connecting');
  const updateTabStatus           = useSessionStore((s) => s.updateTabStatus);

  const onStatusChange = useCallback((s: SocketStatus) => {
    setStatus(s);
    updateTabStatus(tabId, s === 'connected' ? 'connected' : s === 'reconnecting' ? 'reconnecting' : s === 'disconnected' ? 'disconnected' : 'connecting');
  }, [tabId, updateTabStatus]);

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
      theme: {
        background:       '#0d1117',
        foreground:       '#c9d1d9',
        cursor:           '#00ff41',
        cursorAccent:     '#0d1117',
        black:            '#484f58',
        red:              '#ff7b72',
        green:            '#3fb950',
        yellow:           '#d29922',
        blue:             '#58a6ff',
        magenta:          '#bc8cff',
        cyan:             '#39c5cf',
        white:            '#b1bac4',
        brightBlack:      '#6e7681',
        brightRed:        '#ffa198',
        brightGreen:      '#56d364',
        brightYellow:     '#e3b341',
        brightBlue:       '#79c0ff',
        brightMagenta:    '#d2a8ff',
        brightCyan:       '#56d4dd',
        brightWhite:      '#f0f6fc',
        selectionBackground: '#264f78',
      },
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

  return (
    <div className="relative w-full h-full bg-neuro-bg" style={{ display: active ? 'flex' : 'none', flexDirection: 'column' }}>
      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-neuro-panel border-b border-neuro-border text-xs font-mono">
        <span className={`w-2 h-2 rounded-full ${
          status === 'connected'    ? 'bg-neuro-green animate-pulse' :
          status === 'reconnecting' ? 'bg-neuro-yellow animate-pulse' :
          status === 'disconnected' ? 'bg-neuro-red' :
          'bg-gray-500 animate-pulse'
        }`} />
        <span className={
          status === 'connected'    ? 'text-neuro-green' :
          status === 'reconnecting' ? 'text-neuro-yellow' :
          status === 'disconnected' ? 'text-neuro-red' :
          'text-gray-400'
        }>
          {status === 'connected'    ? 'connected — tmux persistent' :
           status === 'reconnecting' ? 'reconnecting...' :
           status === 'disconnected' ? 'disconnected' :
           'connecting...'}
        </span>
      </div>

      {/* Terminal */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {/* Reconnecting overlay */}
      {(status === 'reconnecting' || status === 'connecting') && (
        <div className="absolute inset-0 flex items-center justify-center bg-neuro-bg/60 backdrop-blur-sm pointer-events-none"
             style={{ top: '28px' }}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-neuro-cyan border-t-transparent rounded-full animate-spin" />
            <span className="text-neuro-cyan text-sm font-mono">
              {status === 'reconnecting' ? 'Reconnecting... (tmux session alive)' : 'Connecting...'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
