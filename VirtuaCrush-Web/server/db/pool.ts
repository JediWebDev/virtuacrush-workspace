// Single shared Postgres pool. Importing this module never throws at import
// time — connection errors surface on first query.
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // Don't crash the process on idle client errors
  console.error('[pg] idle client error:', err);
});