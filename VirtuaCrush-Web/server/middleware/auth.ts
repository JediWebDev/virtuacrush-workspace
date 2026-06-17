// Better Auth session middleware. Attaches req.user when a valid session
// cookie is present; returns 401 otherwise.
//
// DEV BYPASS: if AUTH_BYPASS=1 is set in .env, attach a fake user instead
// of 401'ing. Use this ONLY for local testing — remove the env var before
// any deployment.
import type { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name?: string };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // --- DEV BYPASS ---------------------------------------------------------
  if (process.env.AUTH_BYPASS === '1') {
    if (process.env.NODE_ENV === 'production') {
      console.error('[auth] AUTH_BYPASS is set in production — blocking request');
      return res.status(500).json({ error: 'misconfigured' });
    }
    req.user = { id: 'dev-test-user', email: 'dev@local', name: 'Dev Tester' };
    return next();
  }
  // -----------------------------------------------------------------------

  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: (session.user as { name?: string }).name,
    };
    next();
  } catch (err) {
    console.error('[auth] session check failed:', err);
    return res.status(401).json({ error: 'unauthorized' });
  }
}