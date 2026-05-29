// Better Auth session middleware. Attaches req.user when a valid session
// cookie is present; returns 401 otherwise.
import type { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Better Auth's getSession accepts a Headers-like object.
    // Express headers are a plain object; we cast for Better Auth's stricter type.
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    req.user = { id: session.user.id, email: session.user.email };
    next();
  } catch (err) {
    console.error('[auth] session check failed:', err);
    return res.status(401).json({ error: 'unauthorized' });
  }
}