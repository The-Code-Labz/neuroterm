import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { openDatabase } from './db/sqlite';
import { CryptoService } from './services/crypto-service';
import { TmuxService } from './services/tmux-service';
import { connectionsRouter } from './api/connections.routes';
import { sessionsRouter } from './api/sessions.routes';
import { handleTerminalWs } from './ws/terminal-ws';
import { authMiddleware, isAuthorizedRequest } from './middleware/auth';

const PORT = Number(process.env.PORT) || 3001;

// ── Bootstrap services ────────────────────────────────────────────────────────
const db     = openDatabase();
const crypto = new CryptoService();
const tmux   = new TmuxService();

// Ensure default local session exists on startup
tmux.createSession(process.env.DEFAULT_TMUX_SESSION || 'neuroterm');

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health — no auth
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Protected routes
app.use('/api/connections', authMiddleware, connectionsRouter(db, crypto));
app.use('/api/sessions',    authMiddleware, sessionsRouter(db, tmux));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const httpServer = createServer(app);

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
  handleTerminalWs(ws, req, { db, crypto, tmux });
});

httpServer.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws/terminal/')) {
    socket.destroy();
    return;
  }

  if (!isAuthorizedRequest(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`NeuroTerm backend running on port ${PORT}`);
  console.log(`Local tmux sessions: ${tmux.listSessions().map((s) => s.name).join(', ') || 'none yet'}`);
});
