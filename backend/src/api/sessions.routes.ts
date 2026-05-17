import { Router } from 'express';
import crypto from 'crypto';
import type { AppDatabase } from '../db/sqlite';
import type { TmuxService } from '../services/tmux-service';

export function sessionsRouter(db: AppDatabase, tmux: TmuxService): Router {
  const router = Router();
  const makeId = () => crypto.randomUUID();
  const now    = () => new Date().toISOString();

  // GET /api/sessions
  router.get('/', (_req, res) => {
    const rows = db.prepare(`SELECT * FROM terminal_sessions WHERE status = 'active' ORDER BY created_at DESC`).all();
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

    const id = makeId();
    const ts = now();

    db.prepare(`
      INSERT INTO terminal_sessions (id, mode, name, tmux_session, connection_id, status, cols, rows, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(id, mode, name, tmux_session, connection_id || null, Number(cols), Number(rows), ts, ts);

    res.status(201).json({
      id,
      mode,
      name,
      tmux_session,
      connection_id: connection_id || null,
      status: 'active',
      cols: Number(cols),
      rows: Number(rows),
      wsUrl: `/ws/terminal/${id}`,
      created_at: ts,
      updated_at: ts,
    });
  });

  // POST /api/sessions/:id/close
  router.post('/:id/close', (req, res) => {
    const ts = now();
    const result = db.prepare(`
      UPDATE terminal_sessions SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?
    `).run(ts, ts, req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ id: req.params.id, status: 'closed' });
  });

  // DELETE /api/sessions/:id
  router.delete('/:id', (req, res) => {
    const result = db.prepare(`DELETE FROM terminal_sessions WHERE id = ?`).run(req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(204).send();
  });

  return router;
}
