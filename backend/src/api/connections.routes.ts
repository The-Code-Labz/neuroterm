import { Router } from 'express';
import crypto from 'crypto';
import type { AppDatabase } from '../db/sqlite';
import type { CryptoService } from '../services/crypto-service';

export function connectionsRouter(db: AppDatabase, cryptoService: CryptoService): Router {
  const router = Router();

  const makeId = () => crypto.randomUUID();
  const now    = () => new Date().toISOString();

  // GET /api/connections
  router.get('/', (_req, res) => {
    const rows = db.prepare(`
      SELECT id, name, host, port, username, auth_type, tmux_session, mode, created_at, updated_at
      FROM connections ORDER BY name ASC
    `).all();
    res.json(rows);
  });

  // GET /api/connections/:id
  router.get('/:id', (req, res) => {
    const row = db.prepare(`
      SELECT id, name, host, port, username, auth_type, tmux_session, mode, created_at, updated_at
      FROM connections WHERE id = ?
    `).get(req.params.id);
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(row);
  });

  // POST /api/connections
  router.post('/', (req, res) => {
    const { name, host, port = 22, username, auth_type, password, private_key, passphrase, tmux_session = 'neuroterm', mode = 'ssh' } = req.body as Record<string, string>;

    if (!name || !host || !username || !auth_type) {
      res.status(400).json({ error: 'name, host, username, auth_type are required' });
      return;
    }

    const id = makeId();
    const ts = now();

    db.prepare(`
      INSERT INTO connections (id, name, host, port, username, auth_type, password_enc, private_key_enc, passphrase_enc, tmux_session, mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name, host, Number(port), username, auth_type,
      cryptoService.encrypt(password),
      cryptoService.encrypt(private_key),
      cryptoService.encrypt(passphrase),
      tmux_session, mode, ts, ts
    );

    res.status(201).json({ id, name, host, port: Number(port), username, auth_type, tmux_session, mode, created_at: ts, updated_at: ts });
  });

  // PATCH /api/connections/:id
  router.patch('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM connections WHERE id = ?`).get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

    const { name, host, port, username, auth_type, password, private_key, passphrase, tmux_session, mode } = req.body as Record<string, string>;
    const ts = now();

    db.prepare(`
      UPDATE connections SET
        name = ?, host = ?, port = ?, username = ?, auth_type = ?,
        password_enc = ?, private_key_enc = ?, passphrase_enc = ?,
        tmux_session = ?, mode = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name      ?? existing['name'],
      host      ?? existing['host'],
      port      ? Number(port) : existing['port'],
      username  ?? existing['username'],
      auth_type ?? existing['auth_type'],
      password     ? cryptoService.encrypt(password)     : existing['password_enc'],
      private_key  ? cryptoService.encrypt(private_key)  : existing['private_key_enc'],
      passphrase   ? cryptoService.encrypt(passphrase)   : existing['passphrase_enc'],
      tmux_session ?? existing['tmux_session'],
      mode         ?? existing['mode'],
      ts, req.params.id
    );

    res.json({ id: req.params.id, updated_at: ts });
  });

  // DELETE /api/connections/:id
  router.delete('/:id', (req, res) => {
    const result = db.prepare(`DELETE FROM connections WHERE id = ?`).run(req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(204).send();
  });

  return router;
}
