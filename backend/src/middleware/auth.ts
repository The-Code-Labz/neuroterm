import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage } from 'http';

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

function isValidJwt(token: string): boolean {
  const secret = jwtSecret();
  if (!secret) return false;
  try {
    jwt.verify(token, secret);
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

// ── Express middleware ────────────────────────────────────────────────────────

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = tokenFromHeader(req.header('authorization'));

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (isValidStaticToken(token) || isValidJwt(token)) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}

// ── WebSocket upgrade check ───────────────────────────────────────────────────

export function isAuthorizedRequest(req: IncomingMessage): boolean {
  const authToken = tokenFromHeader(req.headers.authorization);
  if (authToken && (isValidStaticToken(authToken) || isValidJwt(authToken))) return true;

  const url        = new URL(req.url || '/', 'http://localhost');
  const queryToken = url.searchParams.get('token');
  if (queryToken && (isValidStaticToken(queryToken) || isValidJwt(queryToken))) return true;

  return false;
}
