import type { Request, Response, NextFunction } from 'express';

// Minimal in-memory fixed-window rate limiter — no new dependency, consistent
// with this app's single-process architecture. Not distributed-safe, which
// is fine here: neuroterm runs as one backend instance.

interface Window {
  count: number;
  resetAt: number;
}

export function rateLimit(opts: { windowMs: number; max: number; message?: string }) {
  const { windowMs, max, message = 'Too many requests, please try again later.' } = opts;
  const hits = new Map<string, Window>();

  // Periodically drop expired entries so the map doesn't grow unbounded.
  setInterval(() => {
    const now = Date.now();
    for (const [key, w] of hits) {
      if (w.resetAt <= now) hits.delete(key);
    }
  }, windowMs).unref();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const existing = hits.get(key);

    if (!existing || existing.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.count >= max) {
      const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: message });
      return;
    }

    existing.count += 1;
    next();
  };
}
