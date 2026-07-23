import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage } from 'http';

const JWT_ALGORITHM = 'HS256' as const;
const WS_SUBPROTOCOL_PREFIX = 'neuroterm-auth.';

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

function isValidJwt(token: string): boolean {
  const secret = jwtSecret();
  if (!secret) return false;
  try {
    jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] });
    return true;
  } catch {
    return false;
  }
}

function isValidStaticToken(token: string): boolean {
  const expected = staticToken();
  if (!expected) return false;
  return safeTokenEqual(token, expected);
}

function isValidToken(token: string): boolean {
  return isValidStaticToken(token) || isValidJwt(token);
}

// ── Express middleware ────────────────────────────────────────────────────────

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = tokenFromHeader(req.header('authorization'));

  if (!token || !isValidToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

// ── WebSocket upgrade check ───────────────────────────────────────────────────

export function isAuthorizedRequest(req: IncomingMessage): boolean {
  const headerToken = tokenFromHeader(req.headers.authorization);
  if (headerToken && isValidToken(headerToken)) return true;

  const subprotocolToken = tokenFromSubprotocol(req.headers['sec-websocket-protocol']);
  if (subprotocolToken && isValidToken(subprotocolToken)) return true;

  // Query-string token kept only as a legacy fallback (e.g. manual testing
  // with a plain WS client that can't set subprotocols). Prefer the
  // subprotocol path above — see the comment on tokenFromSubprotocol.
  const url        = new URL(req.url || '/', 'http://localhost');
  const queryToken = url.searchParams.get('token');
  if (queryToken && isValidToken(queryToken)) return true;

  return false;
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
  if (!process.env.JWT_SECRET) {
    // eslint-disable-next-line no-console
    console.warn(
      '[auth] JWT_SECRET is not set — falling back to NEUROTERM_AUTH_TOKEN for JWT signing. ' +
      'This means the static bearer token and the JWT signing key are the same secret. ' +
      'Set a distinct JWT_SECRET in .env for defense-in-depth (see .env.example).'
    );
  }
}
