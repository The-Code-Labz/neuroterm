import { watch as fsWatch, type FSWatcher } from 'fs';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { AppDatabase } from '../db/sqlite';
import type { CryptoService } from '../services/crypto-service';
import { canAccessOwner, type AuthContext } from '../middleware/auth';
import { resolveConnectionAuth } from '../services/ssh-auth';
import { openPersistentSftp } from '../services/sftp-client';
import { sftpBackend, type FileEntryInfo, type StatInfo } from '../services/file-fs';

// Live-update companion to api/files.routes.ts — the REST API does the
// actual list/read/write, this just tells an open Explorer pane "something
// changed at this path, refetch it". Deliberately NOT a full recursive
// filesystem mirror: the client only subscribes to paths it currently has
// open (an expanded directory, or the file in the active editor tab), which
// keeps this cheap and matches how the tree is lazily loaded in the first
// place.
//
// Local: native fs.watch per subscribed path (no new dependency — lighter
// than pulling in chokidar for what's really a handful of watched paths).
// SSH: no inotify over SFTP, so subscribed paths are polled on one shared
// timer per connection, diffing dir listings / file mtimes against the last
// snapshot.

interface ClientWatch   { type: 'watch';   path: string }
interface ClientUnwatch { type: 'unwatch'; path: string }
interface ClientPing    { type: 'ping' }
type ClientMessage = ClientWatch | ClientUnwatch | ClientPing;

function send(ws: WebSocket, payload: object): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

export interface FilesWsOptions {
  db: AppDatabase;
  crypto: CryptoService;
  auth: AuthContext;
}

export function handleFilesWs(ws: WebSocket, req: IncomingMessage, opts: FilesWsOptions): void {
  const url = new URL(req.url || '/', 'http://localhost');
  // /ws/files/local  or  /ws/files/ssh/:connectionId
  const parts = url.pathname.split('/').filter(Boolean);
  const mode = parts[2];
  const { db, crypto, auth } = opts;

  if (mode === 'local') {
    startLocalWatch(ws);
    return;
  }

  if (mode === 'ssh') {
    const connectionId = parts[3];
    const connection = db.prepare(`SELECT * FROM connections WHERE id = ?`).get(connectionId) as
      | Record<string, unknown>
      | undefined;
    if (!connection || !canAccessOwner(auth, connection['user_id'] as string | null)) {
      send(ws, { type: 'error', message: 'Connection not found' });
      ws.close();
      return;
    }
    startSshWatch(ws, db, crypto, connection);
    return;
  }

  ws.close();
}

// ─── Local ──────────────────────────────────────────────────────────────────

function startLocalWatch(ws: WebSocket): void {
  const watchers = new Map<string, FSWatcher>();

  send(ws, { type: 'ready' });

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()) as ClientMessage; } catch { return; }

    if (msg.type === 'watch') {
      if (watchers.has(msg.path)) return;
      try {
        const watcher = fsWatch(msg.path, () => {
          send(ws, { type: 'change', path: msg.path });
        });
        watcher.on('error', () => {
          watchers.delete(msg.path);
        });
        watchers.set(msg.path, watcher);
      } catch (err) {
        send(ws, { type: 'error', message: (err as Error).message, path: msg.path });
      }
    } else if (msg.type === 'unwatch') {
      const watcher = watchers.get(msg.path);
      if (watcher) { try { watcher.close(); } catch { /* ignore */ } watchers.delete(msg.path); }
    } else if (msg.type === 'ping') {
      send(ws, { type: 'pong' });
    }
  });

  ws.on('close', () => {
    for (const watcher of watchers.values()) { try { watcher.close(); } catch { /* ignore */ } }
    watchers.clear();
  });
}

// ─── SSH (polled) ─────────────────────────────────────────────────────────────

const SSH_POLL_INTERVAL_MS = 4000;

interface DirSnapshot { kind: 'dir'; entries: Map<string, number> } // name -> mtime
interface FileSnapshot { kind: 'file'; mtime: number; size: number }
type Snapshot = DirSnapshot | FileSnapshot;

function snapshotDir(entries: FileEntryInfo[]): DirSnapshot {
  return { kind: 'dir', entries: new Map(entries.map((e) => [e.name, e.mtime])) };
}

function dirSnapshotsEqual(a: DirSnapshot, b: DirSnapshot): boolean {
  if (a.entries.size !== b.entries.size) return false;
  for (const [name, mtime] of a.entries) {
    if (b.entries.get(name) !== mtime) return false;
  }
  return true;
}

async function startSshWatch(
  ws: WebSocket,
  db: AppDatabase,
  crypto: CryptoService,
  connectionRow: Record<string, unknown>
): Promise<void> {
  const resolved = resolveConnectionAuth(db, crypto, connectionRow);

  let handle: Awaited<ReturnType<typeof openPersistentSftp>>;
  try {
    handle = await openPersistentSftp(db, resolved);
  } catch (err) {
    send(ws, { type: 'error', message: (err as Error).message });
    ws.close();
    return;
  }

  if (ws.readyState !== ws.OPEN) { handle.close(); return; }

  const backend = sftpBackend(handle.sftp);
  const subscriptions = new Set<string>();
  const snapshots = new Map<string, Snapshot>();

  handle.onError((err) => {
    send(ws, { type: 'error', message: `SFTP connection lost: ${err.message}` });
    ws.close();
  });

  const pollOne = async (path: string): Promise<void> => {
    try {
      const stat: StatInfo = await backend.stat(path);
      if (stat.type === 'dir') {
        const entries = await backend.list(path);
        const next = snapshotDir(entries);
        const prev = snapshots.get(path);
        if (!prev || prev.kind !== 'dir' || !dirSnapshotsEqual(prev, next)) {
          snapshots.set(path, next);
          if (prev) send(ws, { type: 'change', path });
        }
      } else {
        const next: FileSnapshot = { kind: 'file', mtime: stat.mtime, size: stat.size };
        const prev = snapshots.get(path);
        if (!prev || prev.kind !== 'file' || prev.mtime !== next.mtime || prev.size !== next.size) {
          snapshots.set(path, next);
          if (prev) send(ws, { type: 'change', path });
        }
      }
    } catch {
      // Path may have been deleted/renamed mid-poll — drop it silently
      // rather than spamming the client; a subsequent list/read will
      // surface the real error through the REST API.
      snapshots.delete(path);
    }
  };

  const pollInterval = setInterval(() => {
    for (const path of subscriptions) void pollOne(path);
  }, SSH_POLL_INTERVAL_MS);

  send(ws, { type: 'ready' });

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()) as ClientMessage; } catch { return; }

    if (msg.type === 'watch') {
      subscriptions.add(msg.path);
      void pollOne(msg.path); // seed the initial snapshot immediately
    } else if (msg.type === 'unwatch') {
      subscriptions.delete(msg.path);
      snapshots.delete(msg.path);
    } else if (msg.type === 'ping') {
      send(ws, { type: 'pong' });
    }
  });

  ws.on('close', () => {
    clearInterval(pollInterval);
    handle.close();
  });
}
