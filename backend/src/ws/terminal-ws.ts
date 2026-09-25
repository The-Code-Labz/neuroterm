import * as pty from 'node-pty';
import { Client as SSHClient } from 'ssh2';
import { StringDecoder } from 'string_decoder';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { AppDatabase } from '../db/sqlite';
import type { CryptoService } from '../services/crypto-service';
import { TmuxService, isValidTmuxSessionName } from '../services/tmux-service';
import { canAccessOwner, type AuthContext } from '../middleware/auth';
import { clampDims } from '../utils/terminal-dims';
import { resolveConnectionAuth, makeHostVerifier, type ResolvedConnection } from '../services/ssh-auth';

// ─── Wire protocol ────────────────────────────────────────────────────────────

interface ClientInit    { type: 'init';   cols: number; rows: number }
interface ClientInput   { type: 'input';  data: string }
interface ClientResize  { type: 'resize'; cols: number; rows: number }
interface ClientPing    { type: 'ping' }
interface ClientDetach  { type: 'detach' }
interface ClientClose   { type: 'close' }

type ClientMessage = ClientInit | ClientInput | ClientResize | ClientPing | ClientDetach | ClientClose;

function send(ws: WebSocket, payload: object): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

// ─── Runtime registry ─────────────────────────────────────────────────────────

interface RuntimeSession {
  cleanup: () => void;
}

const activeSessions = new Map<string, RuntimeSession>();

/**
 * Terminate the live runtime (PTY / SSH stream) backing a session, if one is
 * currently attached. Safe to call for a session with no live runtime (e.g.
 * created but never connected) — it's just a no-op in that case.
 */
export function closeSession(sessionId: string): void {
  const runtime = activeSessions.get(sessionId);
  if (!runtime) return;
  try { runtime.cleanup(); } catch { /* ignore */ }
  activeSessions.delete(sessionId);
}

/** Persist the last-known terminal size so a future reattach (server restart,
 *  dropped connection, etc.) resumes at the size the client actually last
 *  displayed rather than the size recorded at session creation. */
function persistDims(db: AppDatabase, sessionId: string, cols: number, rows: number): void {
  try {
    db.prepare(`UPDATE terminal_sessions SET cols = ?, rows = ?, updated_at = ? WHERE id = ?`)
      .run(cols, rows, new Date().toISOString(), sessionId);
  } catch { /* best-effort */ }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export interface TerminalWsOptions {
  db: AppDatabase;
  crypto: CryptoService;
  tmux: TmuxService;
  auth: AuthContext;
}

export function handleTerminalWs(
  ws: WebSocket,
  req: IncomingMessage,
  opts: TerminalWsOptions
): void {
  const url       = new URL(req.url || '/', 'http://localhost');
  const sessionId = url.pathname.split('/').pop() || '';
  const { db, crypto, tmux, auth } = opts;

  // ── Load session row ──────────────────────────────────────────────────────
  const session = db.prepare(
    `SELECT * FROM terminal_sessions WHERE id = ? AND status = 'active'`
  ).get(sessionId) as Record<string, unknown> | undefined;

  if (!session || !canAccessOwner(auth, session['user_id'] as string | null)) {
    send(ws, { type: 'error', code: 'SESSION_NOT_FOUND', message: 'Session not found or closed' });
    ws.close();
    return;
  }

  const mode        = session['mode'] as string;
  const tmuxSession = session['tmux_session'] as string;
  const cols        = (session['cols'] as number) || 220;
  const rows        = (session['rows'] as number) || 50;

  // Defense in depth — tmux_session is validated at the API boundary
  // (POST /api/sessions), but this value also gets interpolated into a
  // remote shell command for SSH mode, so re-validate here too rather than
  // trust that every write path enforces the same rule.
  if (!isValidTmuxSessionName(tmuxSession)) {
    send(ws, { type: 'error', code: 'INVALID_SESSION_NAME', message: 'Session has an invalid tmux session name' });
    ws.close();
    return;
  }

  // Mark last connected
  db.prepare(`UPDATE terminal_sessions SET last_connected_at = ?, updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), new Date().toISOString(), sessionId);

  send(ws, { type: 'status', status: 'connecting' });

  // ── Ping / keepalive ──────────────────────────────────────────────────────
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) send(ws, { type: 'pong' });
  }, 25_000);

  // ── Route to correct mode ─────────────────────────────────────────────────
  if (mode === 'local') {
    spawnLocalTmux({ ws, db, tmux, tmuxSession, cols, rows, sessionId, pingInterval });
  } else {
    // Load connection row
    const connection = db.prepare(
      `SELECT * FROM connections WHERE id = ?`
    ).get(session['connection_id'] as string) as Record<string, unknown> | undefined;

    // Defense in depth — a session created against a connection the caller
    // owns should never later point at a connection they don't, but don't
    // trust that invariant blindly.
    if (!connection || !canAccessOwner(auth, connection['user_id'] as string | null)) {
      send(ws, { type: 'error', code: 'CONNECTION_NOT_FOUND', message: 'SSH connection not found' });
      clearInterval(pingInterval);
      ws.close();
      return;
    }

    // ── Resolve auth source ─────────────────────────────────────────────────
    // If the connection references a saved credential, load auth from there.
    // Otherwise use the auth stored directly on the connection row. Shared
    // with services/sftp-client.ts so the merge logic can't drift between
    // the interactive-shell and file-explorer code paths.
    const resolved = resolveConnectionAuth(db, crypto, connection);

    spawnSshTmux({ ws, db, resolved, tmux, tmuxSession, cols, rows, sessionId, pingInterval });
  }
}

// ─── LOCAL TMUX MODE ──────────────────────────────────────────────────────────

interface LocalOpts {
  ws: WebSocket;
  db: AppDatabase;
  tmux: TmuxService;
  tmuxSession: string;
  cols: number;
  rows: number;
  sessionId: string;
  pingInterval: ReturnType<typeof setInterval>;
}

function spawnLocalTmux(opts: LocalOpts): void {
  const { ws, db, tmux, tmuxSession, cols, rows, pingInterval } = opts;

  // Ensure tmux session exists
  tmux.createSession(tmuxSession, cols, rows);

  const ptyProcess = pty.spawn('tmux', ['new-session', '-A', '-s', tmuxSession], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.WORKSPACE_PATH || '/workspace',
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>,
  });

  send(ws, { type: 'status', status: 'tmux_ready', tmuxSession });

  // PTY → browser
  ptyProcess.onData((data: string) => {
    send(ws, { type: 'output', data });
  });

  ptyProcess.onExit(() => {
    send(ws, { type: 'closed', reason: 'process_exit' });
    clearInterval(pingInterval);
    activeSessions.delete(opts.sessionId);
    ws.close();
  });

  // Browser → PTY
  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()) as ClientMessage; } catch { return; }

    switch (msg.type) {
      case 'input':  ptyProcess.write(msg.data); break;
      case 'init':
      case 'resize': {
        const d = clampDims(msg.cols, msg.rows);
        ptyProcess.resize(d.cols, d.rows);
        persistDims(db, opts.sessionId, d.cols, d.rows);
        break;
      }
      case 'ping':   send(ws, { type: 'pong' }); break;
      case 'close':
      case 'detach':
        ptyProcess.write('q');
        break;
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    activeSessions.delete(opts.sessionId);
    try { ptyProcess.kill(); } catch { /* already gone */ }
  });

  activeSessions.set(opts.sessionId, { cleanup: () => { try { ptyProcess.kill(); } catch { /* ignore */ } } });
}

// ─── SSH TMUX MODE ────────────────────────────────────────────────────────────

interface SshOpts {
  ws: WebSocket;
  db: AppDatabase;
  resolved: ResolvedConnection;
  tmux: TmuxService;
  tmuxSession: string;
  cols: number;
  rows: number;
  sessionId: string;
  pingInterval: ReturnType<typeof setInterval>;
}

function spawnSshTmux(opts: SshOpts): void {
  const { ws, db, resolved, tmuxSession, cols, rows, pingInterval } = opts;

  const sshClient = new SSHClient();

  const { host, port, username, authType } = resolved;

  // TOFU (trust-on-first-use) host-key pinning: the server's key hash is
  // pinned to this connection on first successful handshake. Any later
  // handshake presenting a different key is refused outright — without this,
  // ssh2 accepts any host key by default and every SSH session here is
  // blind to MITM interception.
  const connectConfig: Parameters<SSHClient['connect']>[0] = {
    host,
    port,
    username,
    readyTimeout: 20_000,
    keepaliveInterval: 10_000,
    hostHash: 'sha256',
    hostVerifier: makeHostVerifier(db, resolved, {
      onNewKey: (hashedKey) => {
        send(ws, {
          type: 'output',
          data: `\r\n\x1b[33m⚠ New host key for ${host}:${port} — pinned as SHA256:${hashedKey}\x1b[0m\r\n`,
        });
      },
      onMismatch: (hashedKey) => {
        send(ws, {
          type: 'error',
          code: 'HOST_KEY_MISMATCH',
          message: `Host key for ${host}:${port} does not match the pinned key (SHA256:${hashedKey}) — refusing to connect (possible MITM). ` +
            `If this host was legitimately reprovisioned, clear its pinned key on the connection and reconnect.`,
        });
      },
    }),
  };

  if (authType === 'private_key') {
    if (!resolved.privateKey) {
      send(ws, { type: 'error', code: 'NO_KEY', message: 'Private key not found — check saved credential' });
      clearInterval(pingInterval);
      ws.close();
      return;
    }
    connectConfig.privateKey = resolved.privateKey;
    if (resolved.passphrase) connectConfig.passphrase = resolved.passphrase;
  } else {
    if (!resolved.password) {
      send(ws, { type: 'error', code: 'NO_PASSWORD', message: 'Password not found — check saved credential' });
      clearInterval(pingInterval);
      ws.close();
      return;
    }
    connectConfig.password = resolved.password;
  }

  sshClient.on('ready', () => {
    send(ws, { type: 'status', status: 'ssh_ready' });

    sshClient.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
      if (err) {
        send(ws, { type: 'error', code: 'SHELL_ERROR', message: err.message });
        clearInterval(pingInterval);
        sshClient.end();
        ws.close();
        return;
      }

      // Bootstrap tmux on remote — attach if exists, create if not.
      // tmuxSession is validated by isValidTmuxSessionName() above
      // ([a-zA-Z0-9_-] only), so it's safe to interpolate directly —
      // no quoting/escaping could smuggle shell metacharacters through it.
      const tmuxCmd = `tmux new-session -A -s ${tmuxSession}\r`;
      stream.write(tmuxCmd);

      send(ws, { type: 'status', status: 'tmux_ready', tmuxSession });

      // Stream → browser. Decode with a persistent StringDecoder rather than
      // Buffer#toString('utf8') per chunk — TCP frames a byte stream, so a
      // multi-byte UTF-8 character (box-drawing glyphs, emoji, non-ASCII
      // prompts, etc.) can straddle two chunks. Decoding each chunk in
      // isolation turns the split half of that character into U+FFFD on
      // both sides, permanently corrupting/"disappearing" text — the
      // decoder buffers incomplete trailing bytes until the rest arrives.
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');

      stream.on('data', (data: Buffer) => {
        send(ws, { type: 'output', data: stdoutDecoder.write(data) });
      });

      stream.stderr.on('data', (data: Buffer) => {
        send(ws, { type: 'output', data: stderrDecoder.write(data) });
      });

      stream.on('close', () => {
        send(ws, { type: 'closed', reason: 'stream_close' });
        clearInterval(pingInterval);
        activeSessions.delete(opts.sessionId);
        sshClient.end();
        ws.close();
      });

      // Browser → stream
      ws.on('message', (raw) => {
        let msg: ClientMessage;
        try { msg = JSON.parse(raw.toString()) as ClientMessage; } catch { return; }

        switch (msg.type) {
          case 'input':  stream.write(msg.data); break;
          case 'init':
          case 'resize': {
            const d = clampDims(msg.cols, msg.rows);
            stream.setWindow(d.rows, d.cols, 0, 0);
            persistDims(db, opts.sessionId, d.cols, d.rows);
            break;
          }
          case 'ping':   send(ws, { type: 'pong' }); break;
          case 'detach': stream.write('q'); break;
          case 'close':  stream.close(); break;
        }
      });

      ws.on('close', () => {
        clearInterval(pingInterval);
        activeSessions.delete(opts.sessionId);
        try { stream.close(); } catch { /* ignore */ }
        try { sshClient.end(); } catch { /* ignore */ }
      });

      activeSessions.set(opts.sessionId, {
        cleanup: () => {
          try { stream.close(); } catch { /* ignore */ }
          try { sshClient.end(); } catch { /* ignore */ }
        },
      });
    });
  });

  sshClient.on('error', (err) => {
    send(ws, { type: 'error', code: 'SSH_ERROR', message: err.message });
    clearInterval(pingInterval);
    ws.close();
  });

  sshClient.connect(connectConfig);
}
