// Node-based migration runner (no psql binary required).
// Applies every db/migrations/*.sql file in lexical order using the pg pool.
// Migrations use CREATE TABLE/INDEX IF NOT EXISTS, so re-running is safe.
//
// Run with: npm run migrate
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pool } from '../server/db/pool';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[migrate] DATABASE_URL is not set (check your .env)');
    process.exit(1);
  }

  // Wait for the database to accept connections. Railway's internal Postgres
  // networking can lag a few seconds at container boot, and without this the
  // migrate step (and therefore the whole server start) could stall past the
  // healthcheck window. Bounded so a truly unreachable DB still fails clearly.
  let ready = false;
  for (let attempt = 1; attempt <= 15 && !ready; attempt++) {
    try {
      await pool.query('SELECT 1');
      ready = true;
    } catch {
      console.log(`[migrate] database not ready yet (attempt ${attempt}/15) — retrying in 2s`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!ready) {
    console.error('[migrate] database unreachable after retries — aborting');
    process.exit(1);
  }

  const dir = path.join(process.cwd(), 'db', 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.warn('[migrate] no .sql files found in db/migrations');
  }

  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), 'utf8');
    process.stdout.write(`[migrate] applying ${file} ... `);
    await pool.query(sql);
    console.log('ok');
  }

  await pool.end();
  console.log(`[migrate] done — ${files.length} migration(s) applied`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
