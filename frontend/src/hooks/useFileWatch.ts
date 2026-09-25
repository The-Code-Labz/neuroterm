import { useEffect, useRef, useCallback } from 'react';
import type { FileScope } from '../lib/api';

const JWT_KEY = 'neuroterm_jwt';
const RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECTS = 10;

interface UseFileWatchOptions {
  scope: FileScope;
  /** Called whenever the server reports a change at a subscribed path. */
  onChange: (path: string) => void;
  enabled: boolean;
}

/** Live-update companion to the files REST API (backend/src/ws/files-ws.ts).
 *  `watch`/`unwatch` a path to subscribe/unsubscribe; `onChange` fires when
 *  the server detects a change there (local: fs.watch, SSH: mtime polling)
 *  — the caller re-fetches via the REST API, this hook carries no file data
 *  itself. */
export function useFileWatch({ scope, onChange, enabled }: UseFileWatchOptions) {
  const wsRef        = useRef<WebSocket | null>(null);
  const watchedRef    = useRef<Set<string>>(new Set());
  const reconnectRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCount = useRef(0);
  const destroyed     = useRef(false);
  const onChangeRef   = useRef(onChange);
  onChangeRef.current = onChange;

  const connect = useCallback(() => {
    if (destroyed.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const token = localStorage.getItem(JWT_KEY) ?? '';
    const path = scope.mode === 'ssh' ? `/ws/files/ssh/${scope.connection_id}` : '/ws/files/local';
    const url = `${protocol}://${window.location.host}${path}`;

    const ws = new WebSocket(url, [`neuroterm-auth.${token}`]);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectCount.current = 0;
      // Re-subscribe to everything the caller had watched before a reconnect.
      for (const p of watchedRef.current) ws.send(JSON.stringify({ type: 'watch', path: p }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
        if (msg.type === 'change' && typeof msg.path === 'string') {
          onChangeRef.current(msg.path);
        }
      } catch { /* ignore malformed frames */ }
    };

    ws.onclose = () => {
      if (destroyed.current) return;
      if (reconnectCount.current >= MAX_RECONNECTS) return;
      reconnectCount.current += 1;
      reconnectRef.current = setTimeout(() => { if (!destroyed.current) connect(); }, RECONNECT_DELAY_MS);
    };
  }, [scope]);

  const watch = useCallback((path: string) => {
    watchedRef.current.add(path);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'watch', path }));
  }, []);

  const unwatch = useCallback((path: string) => {
    watchedRef.current.delete(path);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'unwatch', path }));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    destroyed.current = false;
    connect();
    return () => {
      destroyed.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      watchedRef.current.clear();
    };
    // `scope` identity change (switching which connection is browsed) tears
    // down and reconnects deliberately — different filesystem entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, connect]);

  return { watch, unwatch };
}
