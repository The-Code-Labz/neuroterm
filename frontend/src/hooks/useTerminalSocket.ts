import { useEffect, useRef, useCallback } from 'react';
import type { Terminal } from '@xterm/xterm';

const TOKEN = import.meta.env.VITE_AUTH_TOKEN ?? '';
const PING_INTERVAL_MS    = 25_000;
const RECONNECT_DELAY_MS  = 2_000;
const MAX_RECONNECTS      = 20;

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface UseTerminalSocketOptions {
  sessionId: string;
  terminal: Terminal | null;
  onStatusChange: (status: SocketStatus) => void;
  enabled: boolean;
}

export function useTerminalSocket({
  sessionId,
  terminal,
  onStatusChange,
  enabled,
}: UseTerminalSocketOptions) {
  const wsRef          = useRef<WebSocket | null>(null);
  const pingRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCount = useRef(0);
  const destroyed      = useRef(false);

  const clearTimers = useCallback(() => {
    if (pingRef.current)      { clearInterval(pingRef.current);  pingRef.current = null; }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
  }, []);

  const connect = useCallback(() => {
    if (destroyed.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws/terminal/${sessionId}?token=${encodeURIComponent(TOKEN)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectCount.current = 0;
      onStatusChange('connected');

      // Send initial size
      if (terminal) {
        ws.send(JSON.stringify({ type: 'init', cols: terminal.cols, rows: terminal.rows }));
      }

      // Keepalive ping
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (evt) => {
      if (!terminal) return;
      try {
        const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
        if (msg.type === 'output') {
          terminal.write(msg.data as string);
        } else if (msg.type === 'status') {
          if (msg.status === 'tmux_ready') {
            terminal.writeln('\r\n\x1b[32m✓ tmux session ready — connection persistent\x1b[0m\r\n');
          }
        } else if (msg.type === 'error') {
          terminal.writeln(`\r\n\x1b[31m✗ Error: ${msg.message as string}\x1b[0m\r\n`);
        } else if (msg.type === 'closed') {
          terminal.writeln('\r\n\x1b[33m⚠ Session closed by server\x1b[0m\r\n');
        }
      } catch {
        // not json — write raw
        terminal.write(evt.data as string);
      }
    };

    ws.onerror = () => {
      // handled in onclose
    };

    ws.onclose = () => {
      clearTimers();
      if (destroyed.current) return;

      if (reconnectCount.current >= MAX_RECONNECTS) {
        onStatusChange('disconnected');
        return;
      }

      onStatusChange('reconnecting');
      reconnectCount.current += 1;

      reconnectRef.current = setTimeout(() => {
        if (!destroyed.current) connect();
      }, RECONNECT_DELAY_MS);
    };
  }, [sessionId, terminal, onStatusChange, clearTimers]);

  // Send input to WebSocket
  const sendInput = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  }, []);

  // Send resize to WebSocket
  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }, []);

  useEffect(() => {
    if (!enabled || !terminal) return;
    destroyed.current = false;
    onStatusChange('connecting');
    connect();

    return () => {
      destroyed.current = true;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, terminal, connect, clearTimers, onStatusChange]);

  return { sendInput, sendResize };
}
