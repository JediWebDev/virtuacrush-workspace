// Node-based migration runner (no psql binary required).
// Applies each db/migrations/*.sql file in lexical order, ONCE, using the pg
// pool. A `schema_migrations` ledger records which files have run so re-deploys
// never re-execute a migration. (Before the ledger, every file re-ran on every
// deploy — fine for CREATE ... IF NOT EXISTS, but catastrophic for any one-time
// data migration like a DELETE/seed, which would repeat forever.)
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

  // Ledger of applied migrations — each file runs at most once, ever.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename   TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
  const { rows: appliedRows } = await pool.query<{ filename: string }>(
    `SELECT filename FROM schema_migrations`,
  );
  const applied = new Set(appliedRows.map((r) => r.filename));

  const dir = path.join(process.cwd(), 'db', 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.warn('[migrate] no .sql files found in db/migrations');
  }

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] skip ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(path.join(dir, file), 'utf8');
    process.stdout.write(`[migrate] applying ${file} ... `);
    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
    ran += 1;
    console.log('ok');
  }

  await pool.end();
  console.log(`[migrate] done — ${ran} new migration(s) applied, ${files.length - ran} already up to date`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
