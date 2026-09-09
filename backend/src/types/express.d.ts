import type { AuthContext } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      /** Set by `createAuthMiddleware` — always present on routes mounted after it. */
      auth?: AuthContext;
    }
  }
}

export {};
