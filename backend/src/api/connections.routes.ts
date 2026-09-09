import { Router } from 'express';
import crypto from 'crypto';
import type { AppDatabase } from '../db/sqlite';
import type { CryptoService } from '../services/crypto-service';
import { isValidTmuxSessionName } from '../services/tmux-service';
import { canAccessOwner, ownerIdFor, type AuthContext } from '../middleware/auth';

type AuthType = 'password' | 'private_key';
type Mode = 'ssh' | 'local';

function isAuthType(v: unknown): v is AuthType {
  return v === 'password' || v === 'private_key';
}
function isMode(v: unknown): v is Mode {
  return v === 'ssh' || v === 'local';
}

interface ConnectionRow {
  id: string;
  user_id: string | null;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: AuthType;
  password_enc: string | null;
  private_key_enc: string | null;
  passphrase_enc: string | null;
  credential_id: string | null;
  host_key_fingerprint: string | null;
  tmux_session: string;
  mode: Mode;
  created_at: string;
  updated_at: string;
}

// `password`/`private_key`/`passphrase` fields are "keep existing unless
// explicitly provided" on PATCH. An explicit `null` clears the stored secret.
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

/** A saved credential can only be attached if the requester can also access it. */
function credentialIsAccessible(db: AppDatabase, auth: AuthContext, credentialId: string): boolean {
  const cred = db.prepare(`SELECT user_id FROM credentials WHERE id = ?`).get(credentialId) as
    | { user_id: string | null }
    | undefined;
  return !!cred && canAccessOwner(auth, cred.user_id);
}

export function connectionsRouter(db: AppDatabase, cryptoService: CryptoService): Router {
  const router = Router();

  const makeId = () => crypto.randomUUID();
  const now    = () => new Date().toISOString();

  // GET /api/connections
  router.get('/', (req, res) => {
    const auth = req.auth!;
    const rows = (
      auth.role === 'admin'
        ? db.prepare(`
            SELECT id, name, host, port, username, auth_type, tmux_session, mode, credential_id, created_at, updated_at
            FROM connections ORDER BY name ASC
          `).all()
        : db.prepare(`
            SELECT id, name, host, port, username, auth_type, tmux_session, mode, credential_id, created_at, updated_at
            FROM connections WHERE user_id = ? ORDER BY name ASC
          `).all(auth.userId)
    );
    res.json(rows);
  });

  // GET /api/connections/:id
  router.get('/:id', (req, res) => {
    const row = db.prepare(`
      SELECT id, user_id, name, host, port, username, auth_type, tmux_session, mode, credential_id, host_key_fingerprint, created_at, updated_at
      FROM connections WHERE id = ?
    `).get(req.params.id) as ConnectionRow | undefined;
    if (!row || !canAccessOwner(req.auth!, row.user_id)) { res.status(404).json({ error: 'Not found' }); return; }
    const { user_id: _user_id, ...safe } = row;
    res.json(safe);
  });

  // POST /api/connections
  router.post('/', (req, res) => {
    const {
      name, host, port = 22, username, auth_type,
      password, private_key, passphrase,
      credential_id,
      tmux_session = 'neuroterm', mode = 'ssh',
    } = req.body as Record<string, string>;

    if (!name || !host || !username || !auth_type) {
      res.status(400).json({ error: 'name, host, username, auth_type are required' });
      return;
    }
    if (!isAuthType(auth_type)) { res.status(400).json({ error: 'auth_type must be password or private_key' }); return; }
    if (!isMode(mode)) { res.status(400).json({ error: 'mode must be ssh or local' }); return; }
    if (!isValidTmuxSessionName(tmux_session)) {
      res.status(400).json({ error: 'tmux_session must match ^[a-zA-Z0-9_-]{1,128}$' });
      return;
    }
    if (credential_id && !credentialIsAccessible(db, req.auth!, credential_id)) {
      res.status(400).json({ error: 'credential_id does not reference an accessible credential' });
      return;
    }

    const id = makeId();
    const ts = now();
    const userId = ownerIdFor(req.auth!);

    db.prepare(`
      INSERT INTO connections (id, user_id, name, host, port, username, auth_type, password_enc, private_key_enc, passphrase_enc, credential_id, tmux_session, mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userId, name, host, Number(port), username, auth_type,
      cryptoService.encrypt(password),
      cryptoService.encrypt(private_key),
      cryptoService.encrypt(passphrase),
      credential_id || null,
      tmux_session, mode, ts, ts
    );

    res.status(201).json({ id, name, host, port: Number(port), username, auth_type, credential_id: credential_id || null, tmux_session, mode, created_at: ts, updated_at: ts });
  });

  // PATCH /api/connections/:id
  router.patch('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM connections WHERE id = ?`).get(req.params.id) as ConnectionRow | undefined;
    if (!existing || !canAccessOwner(req.auth!, existing.user_id)) { res.status(404).json({ error: 'Not found' }); return; }

    const body = req.body as Record<string, unknown>;
    const {
      name, host, port, username, auth_type,
      tmux_session, mode, credential_id,
    } = body as Record<string, string>;

    if (name !== undefined && !name)         { res.status(400).json({ error: 'name cannot be empty' }); return; }
    if (host !== undefined && !host)         { res.status(400).json({ error: 'host cannot be empty' }); return; }
    if (username !== undefined && !username) { res.status(400).json({ error: 'username cannot be empty' }); return; }
    if (auth_type !== undefined && !isAuthType(auth_type)) {
      res.status(400).json({ error: 'auth_type must be password or private_key' }); return;
    }
    if (mode !== undefined && !isMode(mode)) { res.status(400).json({ error: 'mode must be ssh or local' }); return; }
    if (tmux_session !== undefined && !isValidTmuxSessionName(tmux_session)) {
      res.status(400).json({ error: 'tmux_session must match ^[a-zA-Z0-9_-]{1,128}$' });
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'credential_id') &&
      credential_id &&
      !credentialIsAccessible(db, req.auth!, credential_id)
    ) {
      res.status(400).json({ error: 'credential_id does not reference an accessible credential' });
      return;
    }

    const ts = now();

    // credential_id: explicit null clears it, undefined keeps existing
    const newCredentialId = Object.prototype.hasOwnProperty.call(body, 'credential_id')
      ? (credential_id || null)
      : existing.credential_id;

    const newHost     = host ?? existing.host;
    const newPort     = port ? Number(port) : existing.port;
    const newUsername = username ?? existing.username;
    const newAuthType = isAuthType(auth_type) ? auth_type : existing.auth_type;

    // The pinned SSH host key is cleared (re-verified + re-pinned as TOFU on
    // next connect) whenever the host identity changes, OR when the caller
    // explicitly requests it via `{ "host_key_fingerprint": null }` — e.g.
    // after legitimately re-provisioning the same host/IP with a new key.
    const hostIdentityChanged = newHost !== existing.host || newPort !== existing.port;
    const explicitFingerprintReset =
      Object.prototype.hasOwnProperty.call(body, 'host_key_fingerprint') && body.host_key_fingerprint === null;
    const newFingerprint =
      hostIdentityChanged || explicitFingerprintReset ? null : existing.host_key_fingerprint;

    db.prepare(`
      UPDATE connections SET
        name = ?, host = ?, port = ?, username = ?, auth_type = ?,
        password_enc = ?, private_key_enc = ?, passphrase_enc = ?,
        credential_id = ?, host_key_fingerprint = ?,
        tmux_session = ?, mode = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name         ?? existing.name,
      newHost,
      newPort,
      newUsername,
      newAuthType,
      resolveSecretUpdate(body, 'password', cryptoService, existing.password_enc),
      resolveSecretUpdate(body, 'private_key', cryptoService, existing.private_key_enc),
      resolveSecretUpdate(body, 'passphrase', cryptoService, existing.passphrase_enc),
      newCredentialId,
      newFingerprint,
      tmux_session ?? existing.tmux_session,
      mode         ?? existing.mode,
      ts, req.params.id
    );

    res.json({ id: req.params.id, updated_at: ts });
  });

  // DELETE /api/connections/:id
  router.delete('/:id', (req, res) => {
    const existing = db.prepare(`SELECT id, user_id FROM connections WHERE id = ?`).get(req.params.id) as
      | { id: string; user_id: string | null }
      | undefined;
    if (!existing || !canAccessOwner(req.auth!, existing.user_id)) { res.status(404).json({ error: 'Not found' }); return; }

    db.prepare(`DELETE FROM connections WHERE id = ?`).run(req.params.id);
    res.status(204).send();
  });

  return router;
}
