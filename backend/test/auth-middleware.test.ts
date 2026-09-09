import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { openDatabase } from '../src/db/sqlite';
import { resolveAuthContext, canAccessOwner, ownerIdFor } from '../src/middleware/auth';
import type { AppDatabase } from '../src/db/sqlite';

const STATIC_TOKEN = 'the-static-token';
const JWT_SECRET    = 'the-jwt-secret';

describe('resolveAuthContext', () => {
  let db: AppDatabase;

  beforeEach(() => {
    process.env.NEUROTERM_AUTH_TOKEN = STATIC_TOKEN;
    process.env.JWT_SECRET = JWT_SECRET;
    db = openDatabase(':memory:');
  });

  function insertUser(role: 'admin' | 'user') {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'x', ?, ?, ?)
    `).run(id, `user-${id.slice(0, 8)}`, role, new Date().toISOString(), new Date().toISOString());
    return id;
  }

  it('returns null with no token', () => {
    expect(resolveAuthContext({ headers: {} }, db)).toBeNull();
  });

  it('accepts the static bearer token as an admin-equivalent context', () => {
    const ctx = resolveAuthContext({ headers: { authorization: `Bearer ${STATIC_TOKEN}` } }, db);
    expect(ctx).toEqual({ kind: 'static', userId: null, role: 'admin' });
  });

  it('rejects a valid-shape but wrong-secret bearer token', () => {
    const ctx = resolveAuthContext({ headers: { authorization: 'Bearer nope' } }, db);
    expect(ctx).toBeNull();
  });

  it('resolves a JWT to the CURRENT db role, not the role embedded in the token', () => {
    const userId = insertUser('user');
    const token = jwt.sign({ sub: userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });

    const before = resolveAuthContext({ headers: { authorization: `Bearer ${token}` } }, db);
    expect(before).toMatchObject({ kind: 'jwt', role: 'user' });

    db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(userId);
    const afterPromote = resolveAuthContext({ headers: { authorization: `Bearer ${token}` } }, db);
    expect(afterPromote).toMatchObject({ kind: 'jwt', role: 'admin' });

    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    const afterDelete = resolveAuthContext({ headers: { authorization: `Bearer ${token}` } }, db);
    expect(afterDelete).toBeNull();
  });

  it('reads the token from the WS subprotocol header when no Authorization header is present', () => {
    const ctx = resolveAuthContext(
      { headers: { 'sec-websocket-protocol': `neuroterm-auth.${STATIC_TOKEN}` } },
      db
    );
    expect(ctx).toEqual({ kind: 'static', userId: null, role: 'admin' });
  });
});

describe('canAccessOwner / ownerIdFor', () => {
  it('admin can access any owner, including unowned (null) rows', () => {
    expect(canAccessOwner({ kind: 'static', userId: null, role: 'admin' }, null)).toBe(true);
    expect(canAccessOwner({ kind: 'static', userId: null, role: 'admin' }, 'someone-else')).toBe(true);
  });

  it('a regular user can only access their own rows, never unowned/legacy rows', () => {
    const auth = { kind: 'jwt' as const, userId: 'me', username: 'me', role: 'user' as const };
    expect(canAccessOwner(auth, 'me')).toBe(true);
    expect(canAccessOwner(auth, 'someone-else')).toBe(false);
    expect(canAccessOwner(auth, null)).toBe(false);
  });

  it('ownerIdFor: static token stamps null (legacy pool); jwt stamps the user id', () => {
    expect(ownerIdFor({ kind: 'static', userId: null, role: 'admin' })).toBeNull();
    expect(ownerIdFor({ kind: 'jwt', userId: 'abc', username: 'x', role: 'user' })).toBe('abc');
  });
});
