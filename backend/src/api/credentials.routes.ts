import { Router } from 'express';
import crypto from 'crypto';
import type { AppDatabase } from '../db/sqlite';
import type { CryptoService } from '../services/crypto-service';

type AuthType = 'password' | 'private_key';

interface CredentialRow {
  id: string;
  name: string;
  username: string;
  auth_type: AuthType;
  password_enc: string | null;
  private_key_enc: string | null;
  passphrase_enc: string | null;
  created_at: string;
  updated_at: string;
}

function makeId(): string { return crypto.randomUUID(); }
function now(): string { return new Date().toISOString(); }

function isAuthType(v: unknown): v is AuthType {
  return v === 'password' || v === 'private_key';
}

function safeResponse(row: CredentialRow) {
  return {
    id:              row.id,
    name:            row.name,
    username:        row.username,
    auth_type:       row.auth_type,
    has_password:    Boolean(row.password_enc),
    has_private_key: Boolean(row.private_key_enc),
    has_passphrase:  Boolean(row.passphrase_enc),
    created_at:      row.created_at,
    updated_at:      row.updated_at,
  };
}

export function credentialsRouter(db: AppDatabase, cryptoService: CryptoService): Router {
  const router = Router();

  // GET /api/credentials
  router.get('/', (_req, res) => {
    const rows = db.prepare(`
      SELECT id, name, username, auth_type, password_enc, private_key_enc, passphrase_enc, created_at, updated_at
      FROM credentials ORDER BY name ASC
    `).all() as CredentialRow[];
    res.json(rows.map(safeResponse));
  });

  // GET /api/credentials/:id
  router.get('/:id', (req, res) => {
    const row = db.prepare(`
      SELECT id, name, username, auth_type, password_enc, private_key_enc, passphrase_enc, created_at, updated_at
      FROM credentials WHERE id = ?
    `).get(req.params.id) as CredentialRow | undefined;
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(safeResponse(row));
  });

  // POST /api/credentials
  router.post('/', (req, res) => {
    const { name, username, auth_type, password, private_key, passphrase } =
      req.body as Record<string, string>;

    if (!name?.trim())     { res.status(400).json({ error: 'name is required' }); return; }
    if (!username?.trim()) { res.status(400).json({ error: 'username is required' }); return; }
    if (!isAuthType(auth_type)) { res.status(400).json({ error: 'auth_type must be password or private_key' }); return; }
    if (auth_type === 'password' && !password) { res.status(400).json({ error: 'password is required' }); return; }
    if (auth_type === 'private_key' && !private_key) { res.status(400).json({ error: 'private_key is required' }); return; }

    const id = makeId();
    const ts = now();

    db.prepare(`
      INSERT INTO credentials (id, name, username, auth_type, password_enc, private_key_enc, passphrase_enc, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name.trim(), username.trim(), auth_type,
      cryptoService.encrypt(password),
      cryptoService.encrypt(private_key),
      cryptoService.encrypt(passphrase),
      ts, ts
    );

    res.status(201).json({ id, name: name.trim(), username: username.trim(), auth_type, created_at: ts, updated_at: ts });
  });

  // PATCH /api/credentials/:id
  router.patch('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM credentials WHERE id = ?`).get(req.params.id) as CredentialRow | undefined;
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

    const { name, username, auth_type, password, private_key, passphrase } =
      req.body as Record<string, string>;
    const ts = now();

    db.prepare(`
      UPDATE credentials SET
        name = ?, username = ?, auth_type = ?,
        password_enc = ?, private_key_enc = ?, passphrase_enc = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      name     ?? existing.name,
      username ?? existing.username,
      (auth_type && isAuthType(auth_type)) ? auth_type : existing.auth_type,
      password    ? cryptoService.encrypt(password)    : existing.password_enc,
      private_key ? cryptoService.encrypt(private_key) : existing.private_key_enc,
      passphrase  ? cryptoService.encrypt(passphrase)  : existing.passphrase_enc,
      ts, req.params.id
    );

    res.json({ id: req.params.id, updated_at: ts });
  });

  // DELETE /api/credentials/:id
  router.delete('/:id', (req, res) => {
    const result = db.prepare(`DELETE FROM credentials WHERE id = ?`).run(req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(204).send();
  });

  return router;
}
