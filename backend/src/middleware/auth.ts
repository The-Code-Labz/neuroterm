import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage, IncomingHttpHeaders } from 'http';
import type { AppDatabase } from '../db/sqlite';

const JWT_ALGORITHM = 'HS256' as const;
const WS_SUBPROTOCOL_PREFIX = 'neuroterm-auth.';

// ── Auth context ─────────────────────────────────────────────────────────────
// The static bearer token has no associated user account — it's the
// operator's own "root" credential, so it's treated as a superuser: it can
// see/manage every row regardless of owner (identical to this app's
// pre-multi-user behavior). A JWT identifies a specific `users` row and is
// scoped to rows it owns, unless its *current* (DB-fresh, not JWT-embedded)
// role is 'admin'.
export type AuthContext =
  | { kind: 'static'; userId: null; role: 'admin' }
  | { kind: 'jwt'; userId: string; username: string; role: 'admin' | 'user'; jti: string; exp: number };

/** True if `auth` may access/modify a row owned by `ownerId` (null = unowned/legacy row). */
export function canAccessOwner(auth: AuthContext, ownerId: string | null): boolean {
  if (auth.role === 'admin') return true;
  return ownerId !== null && ownerId === auth.userId;
}

/** user_id to stamp on a newly-created row for this auth context. */
export function ownerIdFor(auth: AuthContext): string | null {
  return auth.kind === 'jwt' ? auth.userId : null;
}

function staticToken(): string {
  return process.env.NEUROTERM_AUTH_TOKEN || process.env.AUTH_TOKEN || '';
}

function jwtSecret(): string {
  return process.env.JWT_SECRET || process.env.NEUROTERM_AUTH_TOKEN || '';
}

function safeTokenEqual(a: string, b: string): boolean {
  try {
    const left  = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function tokenFromHeader(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// Browsers can't set arbitrary headers on a WebSocket handshake, so the
// Authorization header trick above only works for plain HTTP requests. For
// the WS upgrade, prefer the Sec-WebSocket-Protocol header over a `?token=`
// query string — proxy/access logs commonly record the request URI verbatim
// (leaking the token into logs and browser history), but do not by default
// log request headers. `new WebSocket(url, ['neuroterm-auth.<token>'])` on
// the client sends the token this way instead.
function tokenFromSubprotocol(header: string | string[] | undefined): string | null {
  if (!header) return null;
  const raw = Array.isArray(header) ? header.join(',') : header;
  for (const part of raw.split(',')) {
    const value = part.trim();
    if (value.startsWith(WS_SUBPROTOCOL_PREFIX)) {
      return value.slice(WS_SUBPROTOCOL_PREFIX.length);
    }
  }
  return null;
}

function tokenFromRequest(input: { headers: IncomingHttpHeaders; url?: string }): string | null {
  const headerToken = tokenFromHeader(input.headers.authorization);
  if (headerToken) return headerToken;

  const subprotocolToken = tokenFromSubprotocol(input.headers['sec-websocket-protocol']);
  if (subprotocolToken) return subprotocolToken;

  // Query-string token kept only as a legacy fallback (e.g. manual testing
  // with a plain WS client that can't set subprotocols). Prefer the
  // subprotocol path above — see the comment on tokenFromSubprotocol.
  if (input.url) {
    const url = new URL(input.url, 'http://localhost');
    const queryToken = url.searchParams.get('token');
    if (queryToken) return queryToken;
  }

  return null;
}

function isValidStaticToken(token: string): boolean {
  const expected = staticToken();
  if (!expected) return false;
  return safeTokenEqual(token, expected);
}

interface JwtPayload { sub: string; ver?: number; jti?: string; exp?: number }

interface UserRoleRow { id: string; username: string; role: 'admin' | 'user'; token_version: number }

/**
 * Resolve the auth context for a request, or null if unauthenticated.
 *
 * For JWTs, role/existence is always re-checked against the *current* users
 * table rather than trusted from the token payload — a revoked or demoted
 * user loses access immediately instead of only once their (up to 7-day-old)
 * token expires. Two more checks back that up:
 *  - `ver` must match the user's current `token_version` (bumped by
 *    logout-all — see bumpTokenVersion — which invalidates every token
 *    issued before the bump in one shot).
 *  - the token's `jti` must not be in `revoked_tokens` (single-token logout
 *    — see revokeToken).
 * Tokens signed before this revocation support existed (no `jti`/`ver`
 * claims) are treated as version 0 / unrevocable-by-jti, matching prior
 * behavior for their remaining lifetime.
 */
export function resolveAuthContext(
  input: { headers: IncomingHttpHeaders; url?: string },
  db: AppDatabase
): AuthContext | null {
  const token = tokenFromRequest(input);
  if (!token) return null;

  if (isValidStaticToken(token)) {
    return { kind: 'static', userId: null, role: 'admin' };
  }

  const secret = jwtSecret();
  if (!secret) return null;

  try {
    const payload = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] }) as JwtPayload;
    const user = db.prepare(`SELECT id, username, role, token_version FROM users WHERE id = ?`).get(payload.sub) as
      | UserRoleRow
      | undefined;
    if (!user) return null;

    const ver = payload.ver ?? 0;
    if (ver !== user.token_version) return null;

    if (payload.jti) {
      const revoked = db.prepare(`SELECT 1 FROM revoked_tokens WHERE jti = ?`).get(payload.jti);
      if (revoked) return null;
    }

    return {
      kind: 'jwt',
      userId: user.id,
      username: user.username,
      role: user.role,
      jti: payload.jti ?? '',
      exp: payload.exp ?? 0,
    };
  } catch {
    return null;
  }
}

/** Revoke a single token (logout) — inert until the token's own natural
 *  expiry, after which it's swept by cleanupExpiredRevocations. No-op for
 *  a token with no `jti` (pre-revocation-support tokens). */
export function revokeToken(db: AppDatabase, jti: string, exp: number): void {
  if (!jti) return;
  cleanupExpiredRevocations(db);
  const expiresAt = exp ? new Date(exp * 1000).toISOString() : new Date().toISOString();
  db.prepare(`
    INSERT INTO revoked_tokens (jti, expires_at, revoked_at)
    VALUES (?, ?, ?)
    ON CONFLICT(jti) DO NOTHING
  `).run(jti, expiresAt, new Date().toISOString());
}

/** Invalidate every token issued to this user before now ("log out
 *  everywhere") by bumping their token_version — any already-issued JWT's
 *  embedded `ver` claim will no longer match. */
export function bumpTokenVersion(db: AppDatabase, userId: string): void {
  db.prepare(`UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), userId);
}

/** Sweep revoked-token rows whose underlying JWT has already naturally
 *  expired — once expired, resolveAuthContext would reject the token on
 *  `jwt.verify` alone, so the revocation row is dead weight. */
export function cleanupExpiredRevocations(db: AppDatabase): void {
  db.prepare(`DELETE FROM revoked_tokens WHERE expires_at < ?`).run(new Date().toISOString());
}

// ── Express middleware ────────────────────────────────────────────────────────

export function createAuthMiddleware(db: AppDatabase) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const auth = resolveAuthContext({ headers: req.headers }, db);
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.auth = auth;
    next();
  };
}

// ── WebSocket upgrade check ───────────────────────────────────────────────────

export function resolveWsAuthContext(req: IncomingMessage, db: AppDatabase): AuthContext | null {
  return resolveAuthContext({ headers: req.headers, url: req.url }, db);
}

// Selects the auth subprotocol back to the client so the WS handshake
// completes cleanly when the client offered one (ws otherwise omits
// Sec-WebSocket-Protocol from the response entirely, which is spec-legal
// but some clients/proxies are stricter about).
export function selectWsProtocol(protocols: Set<string>): string | false {
  for (const p of protocols) {
    if (p.startsWith(WS_SUBPROTOCOL_PREFIX)) return p;
  }
  return false;
}

export function warnIfJwtSecretFallback(): void {
  const jwtSecretEnv = process.env.JWT_SECRET;
  const staticTokenEnv = process.env.NEUROTERM_AUTH_TOKEN || process.env.AUTH_TOKEN;

  if (!jwtSecretEnv) {
    // eslint-disable-next-line no-console
    console.warn(
      '[auth] JWT_SECRET is not set — falling back to NEUROTERM_AUTH_TOKEN for JWT signing. ' +
      'This means the static bearer token and the JWT signing key are the same secret. ' +
      'Set a distinct JWT_SECRET in .env for defense-in-depth (see .env.example).'
    );
    return;
  }

  if (staticTokenEnv && jwtSecretEnv === staticTokenEnv) {
    // eslint-disable-next-line no-console
    console.warn(
      '[auth] JWT_SECRET is set to the same value as NEUROTERM_AUTH_TOKEN. ' +
      'Compromising one secret compromises both — use two distinct random values.'
    );
  }
}
