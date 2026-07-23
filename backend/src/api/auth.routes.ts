import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { AppDatabase } from '../db/sqlite';
import { rateLimit } from '../middleware/rate-limit';

const JWT_ALGORITHM = 'HS256' as const;

// 10 attempts / 5 minutes / IP on each of register and login — independent
// windows so a burst on one doesn't lock out the other.
const authRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts. Please wait before trying again.',
});

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  created_at: string;
  updated_at: string;
}

function makeId(): string { return crypto.randomUUID(); }
function now(): string { return new Date().toISOString(); }

function jwtSecret(): string {
  const s = process.env.JWT_SECRET || process.env.NEUROTERM_AUTH_TOKEN || '';
  if (!s) throw new Error('JWT_SECRET is not configured');
  return s;
}

function signToken(user: Pick<UserRow, 'id' | 'username' | 'role'>): string {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    jwtSecret(),
    { expiresIn: '7d', algorithm: JWT_ALGORITHM }
  );
}

function safeUser(user: UserRow) {
  return { id: user.id, username: user.username, role: user.role, created_at: user.created_at };
}

export function authRouter(db: AppDatabase): Router {
  const router = Router();

  // POST /api/auth/register
  // Only works if no users exist OR ALLOW_REGISTRATION=true
  router.post('/register', authRateLimit, async (req, res) => {
    const { username, password } = req.body as Record<string, string>;

    if (!username?.trim() || !password) {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }

    const userCount = (db.prepare(`SELECT COUNT(*) as count FROM users`).get() as { count: number }).count;
    const allowReg  = process.env.ALLOW_REGISTRATION === 'true';

    if (userCount > 0 && !allowReg) {
      res.status(403).json({ error: 'Registration is disabled. Set ALLOW_REGISTRATION=true to enable.' });
      return;
    }

    const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username.trim());
    if (existing) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const id   = makeId();
    const ts   = now();
    const role: 'admin' | 'user' = userCount === 0 ? 'admin' : 'user';

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, username.trim(), password_hash, role, ts, ts);

    const user = { id, username: username.trim(), role };
    const token = signToken(user);

    res.status(201).json({ token, user: { ...user, created_at: ts } });
  });

  // POST /api/auth/login
  router.post('/login', authRateLimit, async (req, res) => {
    const { username, password } = req.body as Record<string, string>;

    if (!username?.trim() || !password) {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }

    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username.trim()) as UserRow | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const token = signToken(user);
    res.json({ token, user: safeUser(user) });
  });

  // GET /api/auth/me
  router.get('/me', (req, res) => {
    const header = req.headers.authorization;
    if (!header) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) { res.status(401).json({ error: 'Unauthorized' }); return; }

    try {
      const payload = jwt.verify(match[1], jwtSecret(), { algorithms: [JWT_ALGORITHM] }) as { sub: string };
      const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(payload.sub) as UserRow | undefined;
      if (!user) { res.status(401).json({ error: 'User not found' }); return; }
      res.json(safeUser(user));
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  });

  return router;
}
