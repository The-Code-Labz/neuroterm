import { Router } from 'express';
import crypto from 'crypto';
import type { AppDatabase } from '../db/sqlite';
import type { CryptoService } from '../services/crypto-service';
import { canAccessOwner, ownerIdFor } from '../middleware/auth';

type AuthType = 'password' | 'private_key';

interface CredentialRow {
  id: string;
  user_id: string | null;
  name: string;
  host: string | null;
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

// `password`/`private_key`/`passphrase` fields are "keep existing unless
// explicitly provided" on PATCH. A present-but-empty-string value is treated
// as "keep" too (matches the pre-existing contract), but an explicit `null`
// clears the stored secret — previously there was no way to clear one via
// the API at all.
function resolveSecretUpdate(
  body: Record<string, unknown>,
  field: string,
  cryptoService: CryptoService,
  existing: string | null
): string | null {
  if (!Object.prototype.hasOwnProperty.call(body, field)) return existing;
  const value = body[field];
  if (value === null) return null;
  if (typeof value === 'string' && value) return cryptoService.encrypt(value);
  return existing;
}

function safeResponse(row: CredentialRow) {
  return {
    id:              row.id,
    name:            row.name,
    host:            row.host ?? null,
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
  router.get('/', (req, res) => {
    const auth = req.auth!;
    const rows = (
      auth.role === 'admin'
        ? db.prepare(`
            SELECT id, user_id, name, host, username, auth_type, password_enc, private_key_enc, passphrase_enc, created_at, updated_at
            FROM credentials ORDER BY name ASC
          `).all()
        : db.prepare(`
            SELECT id, user_id, name, host, username, auth_type, password_enc, private_key_enc, passphrase_enc, created_at, updated_at
            FROM credentials WHERE user_id = ? ORDER BY name ASC
          `).all(auth.userId)
    ) as CredentialRow[];
    res.json(rows.map(safeResponse));
  });

  // GET /api/credentials/:id
  router.get('/:id', (req, res) => {
    const row = db.prepare(`
      SELECT id, user_id, name, host, username, auth_type, password_enc, private_key_enc, passphrase_enc, created_at, updated_at
      FROM credentials WHERE id = ?
    `).get(req.params.id) as CredentialRow | undefined;
    if (!row || !canAccessOwner(req.auth!, row.user_id)) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(safeResponse(row));
  });

  // POST /api/credentials
  router.post('/', (req, res) => {
    const { name, host, username, auth_type, password, private_key, passphrase } =
      req.body as Record<string, string>;

    if (!name?.trim())     { res.status(400).json({ error: 'name is required' }); return; }
    if (!username?.trim()) { res.status(400).json({ error: 'username is required' }); return; }
    if (!isAuthType(auth_type)) { res.status(400).json({ error: 'auth_type must be password or private_key' }); return; }
    if (auth_type === 'password' && !password) { res.status(400).json({ error: 'password is required' }); return; }
    if (auth_type === 'private_key' && !private_key) { res.status(400).json({ error: 'private_key is required' }); return; }

    const id = makeId();
    const ts = now();
    const userId = ownerIdFor(req.auth!);

    db.prepare(`
      INSERT INTO credentials (id, user_id, name, host, username, auth_type, password_enc, private_key_enc, passphrase_enc, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userId, name.trim(), host?.trim() || null, username.trim(), auth_type,
      cryptoService.encrypt(password),
      cryptoService.encrypt(private_key),
      cryptoService.encrypt(passphrase),
      ts, ts
    );

    res.status(201).json({ id, name: name.trim(), host: host?.trim() || null, username: username.trim(), auth_type, created_at: ts, updated_at: ts });
  });

  // PATCH /api/credentials/:id
  router.patch('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM credentials WHERE id = ?`).get(req.params.id) as CredentialRow | undefined;
    if (!existing || !canAccessOwner(req.auth!, existing.user_id)) { res.status(404).json({ error: 'Not found' }); return; }

    const body = req.body as Record<string, unknown>;
    const { name, host, username, auth_type } = body as Record<string, string>;

    if (name !== undefined && !name.trim())         { res.status(400).json({ error: 'name cannot be empty' }); return; }
    if (username !== undefined && !username.trim()) { res.status(400).json({ error: 'username cannot be empty' }); return; }
    if (auth_type !== undefined && !isAuthType(auth_type)) {
      res.status(400).json({ error: 'auth_type must be password or private_key' }); return;
    }

    const ts = now();

    db.prepare(`
      UPDATE credentials SET
        name = ?, host = ?, username = ?, auth_type = ?,
        password_enc = ?, private_key_enc = ?, passphrase_enc = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      name?.trim()     ?? existing.name,
      host !== undefined ? (host.trim() || null) : existing.host,
      username?.trim() ?? existing.username,
      isAuthType(auth_type) ? auth_type : existing.auth_type,
      resolveSecretUpdate(body, 'password', cryptoService, existing.password_enc),
      resolveSecretUpdate(body, 'private_key', cryptoService, existing.private_key_enc),
      resolveSecretUpdate(body, 'passphrase', cryptoService, existing.passphrase_enc),
      ts, req.params.id
    );

    res.json({ id: req.params.id, updated_at: ts });
  });

  // DELETE /api/credentials/:id
  router.delete('/:id', (req, res) => {
    const existing = db.prepare(`SELECT id, user_id FROM credentials WHERE id = ?`).get(req.params.id) as
      | { id: string; user_id: string | null }
      | undefined;
    if (!existing || !canAccessOwner(req.auth!, existing.user_id)) { res.status(404).json({ error: 'Not found' }); return; }

    db.prepare(`DELETE FROM credentials WHERE id = ?`).run(req.params.id);
    res.status(204).send();
  });

  return router;
}
