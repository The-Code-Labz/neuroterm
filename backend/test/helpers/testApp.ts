import express from 'express';
import type { AppDatabase } from '../../src/db/sqlite';
import { openDatabase } from '../../src/db/sqlite';
import { CryptoService } from '../../src/services/crypto-service';
import { TmuxService } from '../../src/services/tmux-service';
import { connectionsRouter } from '../../src/api/connections.routes';
import { sessionsRouter } from '../../src/api/sessions.routes';
import { credentialsRouter } from '../../src/api/credentials.routes';
import { filesRouter } from '../../src/api/files.routes';
import { authRouter } from '../../src/api/auth.routes';
import { createAuthMiddleware } from '../../src/middleware/auth';

export const TEST_STATIC_TOKEN = 'test-static-token-0123456789abcdef';
export const TEST_JWT_SECRET   = 'test-jwt-secret-0123456789abcdef';
export const TEST_ENCRYPTION_KEY = 'test-encryption-key-0123456789abcdef0123456789';

/** Fake tmux backend for tests — avoids shelling out to a real `tmux` binary. */
class FakeTmuxService extends TmuxService {
  public override sessionExists(): boolean { return true; }
  public override createSession(): void { /* no-op */ }
  public override listSessions() { return []; }
  public override killSession(): void { /* no-op */ }
}

export interface TestAppContext {
  app: express.Express;
  db: AppDatabase;
}

export function buildTestApp(): TestAppContext {
  process.env.NEUROTERM_AUTH_TOKEN = TEST_STATIC_TOKEN;
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  // Multi-user registration flows are what's under test here — production
  // defaults to requiring this explicitly, which is a deliberate, separate
  // decision (see .env.example) and not part of this fix.
  process.env.ALLOW_REGISTRATION = 'true';

  const db     = openDatabase(':memory:');
  const crypto = new CryptoService();
  const tmux   = new FakeTmuxService();

  const app = express();
  // `authRouter`'s login/register rate limiter keys on req.ip and is a
  // MODULE-LEVEL singleton (correct for the real single-process server, see
  // index.ts's `trust proxy` comment) — meaning it's shared across every
  // test in this process. `trust proxy` + a unique X-Forwarded-For per test
  // (see `registerUser`) keeps tests from tripping each other's rate limit.
  app.set('trust proxy', true);
  // Matches index.ts's 8mb limit — files.routes.ts enforces its own 5MB
  // MAX_FILE_BYTES check inside the route handler, which only runs if
  // body-parser's own limit doesn't reject the request first.
  app.use(express.json({ limit: '8mb' }));

  const authMiddleware = createAuthMiddleware(db);
  app.use('/api/auth', authRouter(db));
  app.use('/api/credentials', authMiddleware, credentialsRouter(db, crypto));
  app.use('/api/connections', authMiddleware, connectionsRouter(db, crypto));
  app.use('/api/sessions',    authMiddleware, sessionsRouter(db, tmux, () => { /* no-op */ }));
  app.use('/api/files',       authMiddleware, filesRouter(db, crypto));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, db };
}

let fakeIpCounter = 1;
function nextFakeIp(): string {
  fakeIpCounter += 1;
  return `10.${(fakeIpCounter >> 16) & 0xff}.${(fakeIpCounter >> 8) & 0xff}.${fakeIpCounter & 0xff}`;
}

export async function registerUser(
  app: express.Express,
  username: string,
  password = 'correct horse battery staple'
): Promise<{ token: string; id: string }> {
  const request = (await import('supertest')).default;
  const res = await request(app)
    .post('/api/auth/register')
    .set('X-Forwarded-For', nextFakeIp())
    .send({ username, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, id: res.body.user.id as string };
}
