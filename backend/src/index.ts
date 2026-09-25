import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { openDatabase } from './db/sqlite';
import { CryptoService } from './services/crypto-service';
import { TmuxService } from './services/tmux-service';
import { connectionsRouter } from './api/connections.routes';
import { sessionsRouter } from './api/sessions.routes';
import { credentialsRouter } from './api/credentials.routes';
import { filesRouter } from './api/files.routes';
import { authRouter } from './api/auth.routes';
import { handleTerminalWs, closeSession } from './ws/terminal-ws';
import { handleFilesWs } from './ws/files-ws';
import {
  createAuthMiddleware,
  resolveWsAuthContext,
  selectWsProtocol,
  warnIfJwtSecretFallback,
  cleanupExpiredRevocations,
} from './middleware/auth';
import { rateLimit } from './middleware/rate-limit';

const PORT = Number(process.env.PORT) || 3001;

warnIfJwtSecretFallback();

// ── Bootstrap services ────────────────────────────────────────────────────────
const db     = openDatabase();
const crypto = new CryptoService();
const tmux   = new TmuxService();

// Ensure default local session exists on startup
tmux.createSession(process.env.DEFAULT_TMUX_SESSION || 'neuroterm');

// Sweep any revoked-token rows left over from a previous run whose
// underlying JWT has since expired naturally (see middleware/auth.ts).
cleanupExpiredRevocations(db);

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();

// The documented deployment (docker-compose.yml + frontend/nginx.conf) always
// puts exactly one reverse proxy (the frontend nginx container) in front of
// this service. Without `trust proxy`, Express's `req.ip` resolves to that
// proxy's container IP for every request — meaning the per-IP auth rate
// limiter (see rate-limit.ts / auth.routes.ts) would bucket ALL clients
// together under one shared limit instead of limiting each client
// independently. `1` = trust exactly one hop (the immediate proxy), reading
// the real client IP from the first entry of X-Forwarded-For it sets.
app.set('trust proxy', 1);

// CSP disabled: the frontend is a separately-built static SPA served by
// nginx, not rendered by this process, so a same-origin CSP here would have
// no visibility into its actual script/style sources and risks breaking it
// for no benefit. The other helmet defaults (X-Content-Type-Options,
// X-Frame-Options, HSTS when TLS-terminated, etc.) still apply.
app.use(helmet({ contentSecurityPolicy: false }));
// 8mb (not 2mb) to accommodate the file-explorer's /api/files/write body —
// edited files are capped at 5MB (see MAX_FILE_BYTES in files.routes.ts);
// every other route's payloads are tiny, so this is just a higher ceiling,
// not a new capability for them.
app.use(express.json({ limit: '8mb' }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Public routes — no auth
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});
app.use('/api/auth', authRouter(db));

// Protected routes — static token OR valid JWT. Ownership scoping happens
// per-route based on req.auth (see middleware/auth.ts).
const authMiddleware = createAuthMiddleware(db);
const crudRateLimit  = rateLimit({ windowMs: 60_000, max: 300, message: 'Too many requests, please slow down.' });

app.use('/api/credentials', authMiddleware, crudRateLimit, credentialsRouter(db, crypto));
app.use('/api/connections', authMiddleware, crudRateLimit, connectionsRouter(db, crypto));
app.use('/api/sessions',    authMiddleware, crudRateLimit, sessionsRouter(db, tmux, closeSession));
app.use('/api/files',       authMiddleware, crudRateLimit, filesRouter(db, crypto));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Centralized error handler — catches anything a route handler throws
// synchronously (or passes to `next(err)`) instead of falling through to
// Express's default HTML error page, keeping the API's `{ error }` JSON
// contract consistent everywhere.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const httpServer = createServer(app);

// `ws`'s default maxPayload is unlimited (bounded only by Node's own frame
// handling), so a connected client could send arbitrarily large WS frames
// straight into the JSON.parse calls in ws/terminal-ws.ts with no ceiling.
// 1 MiB comfortably covers a large one-shot terminal paste (xterm.js
// delivers a whole paste as a single `input` message) while bounding memory
// per inbound frame.
const WS_MAX_PAYLOAD_BYTES = 1024 * 1024;

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: WS_MAX_PAYLOAD_BYTES,
  handleProtocols: (protocols) => selectWsProtocol(protocols),
});

httpServer.on('upgrade', (req, socket, head) => {
  const isTerminal = req.url?.startsWith('/ws/terminal/');
  const isFiles    = req.url?.startsWith('/ws/files/');
  if (!isTerminal && !isFiles) {
    socket.destroy();
    return;
  }

  const auth = resolveWsAuthContext(req, db);
  if (!auth) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (isTerminal) {
      handleTerminalWs(ws, req, { db, crypto, tmux, auth });
    } else {
      handleFilesWs(ws, req, { db, crypto, auth });
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`NeuroTerm backend running on port ${PORT}`);
  console.log(`Local tmux sessions: ${tmux.listSessions().map((s) => s.name).join(', ') || 'none yet'}`);
});
