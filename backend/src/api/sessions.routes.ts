import { Router } from 'express';
import crypto from 'crypto';
import type { AppDatabase } from '../db/sqlite';
import { TmuxService, isValidTmuxSessionName } from '../services/tmux-service';
import { canAccessOwner, ownerIdFor } from '../middleware/auth';
import { clampDims } from '../utils/terminal-dims';

type Mode = 'local' | 'ssh';
function isMode(v: unknown): v is Mode {
  return v === 'local' || v === 'ssh';
}

interface SessionRow {
  id: string;
  user_id: string | null;
}

export function sessionsRouter(
  db: AppDatabase,
  tmux: TmuxService,
  closeRuntimeSession: (id: string) => void
): Router {
  const router = Router();
  const makeId = () => crypto.randomUUID();
  const now    = () => new Date().toISOString();

  // GET /api/sessions
  router.get('/', (req, res) => {
    const auth = req.auth!;
    const rows = (
      auth.role === 'admin'
        ? db.prepare(`SELECT * FROM terminal_sessions WHERE status = 'active' ORDER BY created_at DESC`).all()
        : db.prepare(`SELECT * FROM terminal_sessions WHERE status = 'active' AND user_id = ? ORDER BY created_at DESC`).all(auth.userId)
    );
    res.json(rows);
  });

  // GET /api/sessions/tmux — list live tmux sessions in container
  router.get('/tmux', (_req, res) => {
    res.json(tmux.listSessions());
  });

  // POST /api/sessions — create a new session
  router.post('/', (req, res) => {
    const { connection_id, tmux_session, name, mode = 'local', cols = 220, rows = 50 } = req.body as Record<string, unknown>;

    if (!tmux_session || !name) {
      res.status(400).json({ error: 'tmux_session and name are required' });
      return;
    }
    if (!isMode(mode)) { res.status(400).json({ error: 'mode must be local or ssh' }); return; }
    if (!isValidTmuxSessionName(tmux_session)) {
      res.status(400).json({ error: 'tmux_session must match ^[a-zA-Z0-9_-]{1,128}$' });
      return;
    }

    if (mode === 'ssh') {
      if (!connection_id || typeof connection_id !== 'string') {
        res.status(400).json({ error: 'connection_id is required for ssh mode' });
        return;
      }
      const connection = db.prepare(`SELECT user_id FROM connections WHERE id = ?`).get(connection_id) as
        | { user_id: string | null }
        | undefined;
      if (!connection || !canAccessOwner(req.auth!, connection.user_id)) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }
    }

    const id = makeId();
    const ts = now();
    const userId = ownerIdFor(req.auth!);
    const dims = clampDims(Number(cols), Number(rows));

    db.prepare(`
      INSERT INTO terminal_sessions (id, user_id, mode, name, tmux_session, connection_id, status, cols, rows, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(id, userId, mode, name, tmux_session, connection_id || null, dims.cols, dims.rows, ts, ts);

    res.status(201).json({
      id,
      mode,
      name,
      tmux_session,
      connection_id: connection_id || null,
      status: 'active',
      cols: dims.cols,
      rows: dims.rows,
      wsUrl: `/ws/terminal/${id}`,
      created_at: ts,
      updated_at: ts,
    });
  });

  // POST /api/sessions/:id/close
  router.post('/:id/close', (req, res) => {
    const existing = db.prepare(`SELECT id, user_id FROM terminal_sessions WHERE id = ?`).get(req.params.id) as
      | SessionRow
      | undefined;
    if (!existing || !canAccessOwner(req.auth!, existing.user_id)) { res.status(404).json({ error: 'Not found' }); return; }

    const ts = now();
    db.prepare(`
      UPDATE terminal_sessions SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?
    `).run(ts, ts, req.params.id);
    closeRuntimeSession(req.params.id);
    res.json({ id: req.params.id, status: 'closed' });
  });

  // DELETE /api/sessions/:id
  router.delete('/:id', (req, res) => {
    const existing = db.prepare(`SELECT id, user_id FROM terminal_sessions WHERE id = ?`).get(req.params.id) as
      | SessionRow
      | undefined;
    if (!existing || !canAccessOwner(req.auth!, existing.user_id)) { res.status(404).json({ error: 'Not found' }); return; }

    db.prepare(`DELETE FROM terminal_sessions WHERE id = ?`).run(req.params.id);
    closeRuntimeSession(req.params.id);
    res.status(204).send();
  });

  return router;
}
