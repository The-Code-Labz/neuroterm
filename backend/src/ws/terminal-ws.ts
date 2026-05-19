import * as pty from 'node-pty';
import { Client as SSHClient } from 'ssh2';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { AppDatabase } from '../db/sqlite';
import type { CryptoService } from '../services/crypto-service';
import { TmuxService } from '../services/tmux-service';

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

// ─── Main handler ─────────────────────────────────────────────────────────────

export interface TerminalWsOptions {
  db: AppDatabase;
  crypto: CryptoService;
  tmux: TmuxService;
}

export function handleTerminalWs(
  ws: WebSocket,
  req: IncomingMessage,
  opts: TerminalWsOptions
): void {
  const url       = new URL(req.url || '/', 'http://localhost');
  const sessionId = url.pathname.split('/').pop() || '';
  const { db, crypto, tmux } = opts;

  // ── Load session row ──────────────────────────────────────────────────────
  const session = db.prepare(
    `SELECT * FROM terminal_sessions WHERE id = ? AND status = 'active'`
  ).get(sessionId) as Record<string, unknown> | undefined;

  if (!session) {
    send(ws, { type: 'error', code: 'SESSION_NOT_FOUND', message: 'Session not found or closed' });
    ws.close();
    return;
  }

  const mode        = session['mode'] as string;
  const tmuxSession = session['tmux_session'] as string;
  const cols        = (session['cols'] as number) || 220;
  const rows        = (session['rows'] as number) || 50;

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
    spawnLocalTmux({ ws, tmux, tmuxSession, cols, rows, sessionId, pingInterval });
  } else {
    // Load connection row
    const connection = db.prepare(
      `SELECT * FROM connections WHERE id = ?`
    ).get(session['connection_id'] as string) as Record<string, unknown> | undefined;

    if (!connection) {
      send(ws, { type: 'error', code: 'CONNECTION_NOT_FOUND', message: 'SSH connection not found' });
      clearInterval(pingInterval);
      ws.close();
      return;
    }

    // ── Resolve auth source ─────────────────────────────────────────────────
    // If the connection references a saved credential, load auth from there.
    // Otherwise use the auth stored directly on the connection row.
    let authRow: Record<string, unknown> = connection;

    const credentialId = connection['credential_id'] as string | null;
    if (credentialId) {
      const credential = db.prepare(
        `SELECT * FROM credentials WHERE id = ?`
      ).get(credentialId) as Record<string, unknown> | undefined;

      if (credential) {
        // Use credential's auth fields but keep connection's host/port/username
        authRow = {
          ...connection,
          auth_type:       credential['auth_type'],
          password_enc:    credential['password_enc'],
          private_key_enc: credential['private_key_enc'],
          passphrase_enc:  credential['passphrase_enc'],
        };
      }
    }

    spawnSshTmux({ ws, crypto, tmux, connection: authRow, tmuxSession, cols, rows, sessionId, pingInterval });
  }
}

// ─── LOCAL TMUX MODE ──────────────────────────────────────────────────────────

interface LocalOpts {
  ws: WebSocket;
  tmux: TmuxService;
  tmuxSession: string;
  cols: number;
  rows: number;
  sessionId: string;
  pingInterval: ReturnType<typeof setInterval>;
}

function spawnLocalTmux(opts: LocalOpts): void {
  const { ws, tmux, tmuxSession, cols, rows, pingInterval } = opts;

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
    ws.close();
  });

  // Browser → PTY
  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()) as ClientMessage; } catch { return; }

    switch (msg.type) {
      case 'input':  ptyProcess.write(msg.data); break;
      case 'resize': ptyProcess.resize(msg.cols, msg.rows); break;
      case 'ping':   send(ws, { type: 'pong' }); break;
      case 'close':
      case 'detach':
        ptyProcess.write('q');
        break;
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    try { ptyProcess.kill(); } catch { /* already gone */ }
  });

  activeSessions.set(opts.sessionId, { cleanup: () => { try { ptyProcess.kill(); } catch { /* ignore */ } } });
}

// ─── SSH TMUX MODE ────────────────────────────────────────────────────────────

interface SshOpts {
  ws: WebSocket;
  crypto: CryptoService;
  tmux: TmuxService;
  connection: Record<string, unknown>;
  tmuxSession: string;
  cols: number;
  rows: number;
  sessionId: string;
  pingInterval: ReturnType<typeof setInterval>;
}

function spawnSshTmux(opts: SshOpts): void {
  const { ws, crypto, connection, tmuxSession, cols, rows, pingInterval } = opts;

  const sshClient = new SSHClient();

  const host     = connection['host'] as string;
  const port     = (connection['port'] as number) || 22;
  const username = connection['username'] as string;
  const authType = connection['auth_type'] as string;

  const connectConfig: Parameters<SSHClient['connect']>[0] = {
    host,
    port,
    username,
    readyTimeout: 20_000,
    keepaliveInterval: 10_000,
  };

  if (authType === 'private_key') {
    const privateKey = crypto.decrypt(connection['private_key_enc'] as string);
    const passphrase = crypto.decrypt(connection['passphrase_enc'] as string);
    if (!privateKey) {
      send(ws, { type: 'error', code: 'NO_KEY', message: 'Private key not found — check saved credential' });
      clearInterval(pingInterval);
      ws.close();
      return;
    }
    connectConfig.privateKey = privateKey;
    if (passphrase) connectConfig.passphrase = passphrase;
  } else {
    const password = crypto.decrypt(connection['password_enc'] as string);
    if (!password) {
      send(ws, { type: 'error', code: 'NO_PASSWORD', message: 'Password not found — check saved credential' });
      clearInterval(pingInterval);
      ws.close();
      return;
    }
    connectConfig.password = password;
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

      // Bootstrap tmux on remote — attach if exists, create if not
      const tmuxCmd = `tmux new-session -A -s ${JSON.stringify(tmuxSession)}\r`;
      stream.write(tmuxCmd);

      send(ws, { type: 'status', status: 'tmux_ready', tmuxSession });

      // Stream → browser
      stream.on('data', (data: Buffer) => {
        send(ws, { type: 'output', data: data.toString('utf8') });
      });

      stream.stderr.on('data', (data: Buffer) => {
        send(ws, { type: 'output', data: data.toString('utf8') });
      });

      stream.on('close', () => {
        send(ws, { type: 'closed', reason: 'stream_close' });
        clearInterval(pingInterval);
        sshClient.end();
        ws.close();
      });

      // Browser → stream
      ws.on('message', (raw) => {
        let msg: ClientMessage;
        try { msg = JSON.parse(raw.toString()) as ClientMessage; } catch { return; }

        switch (msg.type) {
          case 'input':  stream.write(msg.data); break;
          case 'resize': stream.setWindow(msg.rows, msg.cols, 0, 0); break;
          case 'ping':   send(ws, { type: 'pong' }); break;
          case 'detach': stream.write('q'); break;
          case 'close':  stream.close(); break;
        }
      });

      ws.on('close', () => {
        clearInterval(pingInterval);
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
