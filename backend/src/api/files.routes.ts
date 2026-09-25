import { Router, type Request, type Response } from 'express';
import type { AppDatabase } from '../db/sqlite';
import type { CryptoService } from '../services/crypto-service';
import { canAccessOwner } from '../middleware/auth';
import { resolveConnectionAuth } from '../services/ssh-auth';
import { withSftp } from '../services/sftp-client';
import {
  localBackend,
  sftpBackend,
  removeRecursive,
  type FileBackend,
} from '../services/file-fs';

// File-explorer REST API. Scope mirrors ws/terminal-ws.ts exactly: a "local"
// session/browse has no per-connection ownership check (any authenticated
// user already gets a local tmux session with full container-filesystem
// access — see sessions.routes.ts POST /, which doesn't require
// connection_id for local mode), and an "ssh" browse is scoped to a
// connection the requester owns, reusing the same credential-resolution and
// TOFU host-key pinning as the interactive terminal. No path sandbox is
// applied beyond that — same blast radius as the terminal itself, by design.

// Files this app is meant to edit (configs, source, scripts) are small.
// Bounding read/write keeps a single request's memory bounded and gives the
// editor a clear "too large to edit" signal instead of hanging on a huge
// binary/log file. Matches the bumped express.json body limit in index.ts.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// How many leading bytes to sniff for a NUL byte when deciding whether a
// file is binary (and therefore not safe to show/edit as UTF-8 text).
const BINARY_SNIFF_BYTES = 8000;

function defaultLocalRoot(): string {
  return process.env.WORKSPACE_PATH || '/workspace';
}

function isBinary(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function isSafePath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && !path.includes('\0');
}

interface FsError extends Error { code?: string }

function mapFsError(err: unknown): { status: number; message: string } {
  const e = err as FsError;
  const code = e?.code;
  if (code === 'ENOENT') return { status: 404, message: 'Path not found' };
  if (code === 'EACCES' || code === 'EPERM') return { status: 403, message: 'Permission denied' };
  if (code === 'EEXIST') return { status: 409, message: 'Path already exists' };
  if (code === 'ENOTEMPTY') return { status: 409, message: 'Directory is not empty' };
  if (code === 'ENOTDIR') return { status: 400, message: 'Not a directory' };
  if (code === 'EISDIR') return { status: 400, message: 'Path is a directory' };
  const message = e?.message || '';
  if (/no such file/i.test(message)) return { status: 404, message: 'Path not found' };
  if (/permission denied/i.test(message)) return { status: 403, message: 'Permission denied' };
  return { status: 500, message: message || 'File operation failed' };
}

interface RequestScope {
  mode: 'local' | 'ssh';
  connectionId?: string;
}

function isMode(v: unknown): v is 'local' | 'ssh' {
  return v === 'local' || v === 'ssh';
}

/** Resolve the scope (mode + optional connection_id) from a request's query
 *  or body, checking ownership for ssh mode. Returns null (and writes the
 *  response) on any validation/authz failure. */
function resolveScope(
  req: Request,
  res: Response,
  db: AppDatabase,
  input: Record<string, unknown>
): RequestScope | null {
  const mode = input.mode ?? 'local';
  if (!isMode(mode)) { res.status(400).json({ error: 'mode must be local or ssh' }); return null; }

  if (mode === 'local') return { mode: 'local' };

  const connectionId = input.connection_id;
  if (!connectionId || typeof connectionId !== 'string') {
    res.status(400).json({ error: 'connection_id is required for ssh mode' });
    return null;
  }
  const connection = db.prepare(`SELECT user_id FROM connections WHERE id = ?`).get(connectionId) as
    | { user_id: string | null }
    | undefined;
  if (!connection || !canAccessOwner(req.auth!, connection.user_id)) {
    res.status(404).json({ error: 'Connection not found' });
    return null;
  }
  return { mode: 'ssh', connectionId };
}

/** Run `fn` against the right FileBackend for this scope — local backend
 *  directly, or an on-demand SSH+SFTP connection (closed afterward) for ssh
 *  scope, reusing the same auth/host-key-pinning path as the terminal. */
async function withBackend<T>(
  db: AppDatabase,
  crypto: CryptoService,
  scope: RequestScope,
  fn: (backend: FileBackend) => Promise<T>
): Promise<T> {
  if (scope.mode === 'local') return fn(localBackend());

  const connection = db.prepare(`SELECT * FROM connections WHERE id = ?`).get(scope.connectionId) as
    | Record<string, unknown>
    | undefined;
  if (!connection) throw Object.assign(new Error('Connection not found'), { code: 'ENOENT' });

  const resolved = resolveConnectionAuth(db, crypto, connection);
  return withSftp(db, resolved, (sftp) => fn(sftpBackend(sftp)));
}

export function filesRouter(db: AppDatabase, cryptoService: CryptoService): Router {
  const router = Router();

  // GET /api/files/list?mode=&connection_id=&path=
  router.get('/list', async (req, res) => {
    const scope = resolveScope(req, res, db, req.query as Record<string, unknown>);
    if (!scope) return;
    const path = isSafePath(req.query.path) ? req.query.path : (scope.mode === 'local' ? defaultLocalRoot() : '/');

    try {
      const entries = await withBackend(db, cryptoService, scope, (b) => b.list(path));
      res.json({ path, entries: entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)) });
    } catch (err) {
      const { status, message } = mapFsError(err);
      res.status(status).json({ error: message });
    }
  });

  // GET /api/files/read?mode=&connection_id=&path=
  router.get('/read', async (req, res) => {
    const scope = resolveScope(req, res, db, req.query as Record<string, unknown>);
    if (!scope) return;
    if (!isSafePath(req.query.path)) { res.status(400).json({ error: 'path is required' }); return; }
    const path = req.query.path;

    try {
      const [stat, file] = await withBackend(db, cryptoService, scope, async (b) => {
        const s = await b.stat(path);
        if (s.type !== 'file') throw Object.assign(new Error('Path is a directory'), { code: 'EISDIR' });
        const f = await b.readFile(path, MAX_FILE_BYTES);
        return [s, f] as const;
      });

      if (isBinary(file.buffer)) {
        res.json({ path, binary: true, size: stat.size, mtime: stat.mtime, truncated: file.truncated });
        return;
      }
      res.json({
        path,
        binary: false,
        content: file.buffer.toString('utf8'),
        size: stat.size,
        mtime: stat.mtime,
        truncated: file.truncated,
      });
    } catch (err) {
      const { status, message } = mapFsError(err);
      res.status(status).json({ error: message });
    }
  });

  // POST /api/files/write { mode, connection_id?, path, content }
  router.post('/write', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const scope = resolveScope(req, res, db, body);
    if (!scope) return;
    if (!isSafePath(body.path)) { res.status(400).json({ error: 'path is required' }); return; }
    if (typeof body.content !== 'string') { res.status(400).json({ error: 'content must be a string' }); return; }

    const content = Buffer.from(body.content, 'utf8');
    if (content.byteLength > MAX_FILE_BYTES) {
      res.status(413).json({ error: `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB edit limit` });
      return;
    }

    try {
      const stat = await withBackend(db, cryptoService, scope, async (b) => {
        await b.writeFile(body.path as string, content);
        return b.stat(body.path as string);
      });
      res.json({ path: body.path, size: stat.size, mtime: stat.mtime });
    } catch (err) {
      const { status, message } = mapFsError(err);
      res.status(status).json({ error: message });
    }
  });

  // POST /api/files/mkdir { mode, connection_id?, path }
  router.post('/mkdir', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const scope = resolveScope(req, res, db, body);
    if (!scope) return;
    if (!isSafePath(body.path)) { res.status(400).json({ error: 'path is required' }); return; }

    try {
      await withBackend(db, cryptoService, scope, (b) => b.mkdir(body.path as string));
      res.status(201).json({ path: body.path });
    } catch (err) {
      const { status, message } = mapFsError(err);
      res.status(status).json({ error: message });
    }
  });

  // POST /api/files/delete { mode, connection_id?, path, recursive? }
  router.post('/delete', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const scope = resolveScope(req, res, db, body);
    if (!scope) return;
    if (!isSafePath(body.path)) { res.status(400).json({ error: 'path is required' }); return; }
    const recursive = body.recursive === true;

    try {
      await withBackend(db, cryptoService, scope, async (b) => {
        if (recursive) {
          await removeRecursive(b, body.path as string);
          return;
        }
        const stat = await b.stat(body.path as string);
        if (stat.type === 'dir') await b.removeDir(body.path as string);
        else await b.removeFile(body.path as string);
      });
      res.status(204).send();
    } catch (err) {
      const { status, message } = mapFsError(err);
      res.status(status).json({ error: message });
    }
  });

  // POST /api/files/rename { mode, connection_id?, path, new_path }
  router.post('/rename', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const scope = resolveScope(req, res, db, body);
    if (!scope) return;
    if (!isSafePath(body.path) || !isSafePath(body.new_path)) {
      res.status(400).json({ error: 'path and new_path are required' });
      return;
    }

    try {
      await withBackend(db, cryptoService, scope, (b) => b.rename(body.path as string, body.new_path as string));
      res.json({ path: body.new_path });
    } catch (err) {
      const { status, message } = mapFsError(err);
      res.status(status).json({ error: message });
    }
  });

  return router;
}
