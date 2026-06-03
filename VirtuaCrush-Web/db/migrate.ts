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
