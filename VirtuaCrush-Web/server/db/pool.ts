// Single shared Postgres pool. Importing this module never throws at import
// time — connection errors surface on first query.
import { Pool, type PoolConfig } from 'pg';

// SSL: managed Postgres (Railway/Supabase/Neon) requires TLS over a PUBLIC URL,
// but their certs aren't in the default CA bundle, so we accept them with
// rejectUnauthorized:false. Over an INTERNAL/private URL (e.g. Railway's
// *.railway.internal) TLS is neither needed nor offered. Control with PGSSL:
// 'require' forces SSL on, 'disable' forces it off; unset = auto (on unless the
// host looks internal/localhost).
function resolveSsl(): PoolConfig['ssl'] {
  const mode = (process.env.PGSSL || '').toLowerCase();
  if (mode === 'require' || mode === 'true' || mode === '1') return { rejectUnauthorized: false };
  if (mode === 'disable' || mode === 'false' || mode === '0') return undefined;
  const url = process.env.DATABASE_URL || '';
  const isInternal = /localhost|127\.0\.0\.1|\.internal(?::|\/|$)/.test(url);
  return isInternal ? undefined : { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: resolveSsl(),
  max: 10,
  idleTimeoutMillis: 30_000,
  // Fail a stuck connection attempt in 10s instead of hanging forever (matters
  // at container boot when managed Postgres networking may lag a moment).
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // Don't crash the process on idle client errors
  console.error('[pg] idle client error:', err);
});
