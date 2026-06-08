// Better Auth server configuration. Server-only — never import this from src/.
import { betterAuth } from 'better-auth';
// Reuse the shared, SSL-aware pool (handles managed Postgres over public URLs)
// instead of opening a second connection with no SSL config.
import { pool } from '../db/pool';

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  advanced: {
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
});
