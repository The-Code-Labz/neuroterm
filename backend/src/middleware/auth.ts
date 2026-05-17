import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage } from 'http';

function configuredToken(): string {
  return process.env.NEUROTERM_AUTH_TOKEN || process.env.AUTH_TOKEN || '';
}

function safeTokenEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a);
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

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const expected = configuredToken();
  if (!expected) {
    res.status(500).json({ error: 'Server auth token is not configured' });
    return;
  }
  const token = tokenFromHeader(req.header('authorization'));
  if (!token || !safeTokenEqual(token, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

export function isAuthorizedRequest(req: IncomingMessage): boolean {
  const expected = configuredToken();
  if (!expected) return false;

  const authToken = tokenFromHeader(req.headers.authorization);
  if (authToken && safeTokenEqual(authToken, expected)) return true;

  const url = new URL(req.url || '/', 'http://localhost');
  const queryToken = url.searchParams.get('token');
  if (queryToken && safeTokenEqual(queryToken, expected)) return true;

  return false;
}
