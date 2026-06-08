// Applies db/migrations/*.sql using the shared pool. Used by the server at
// startup (in the background, after it's already listening) and by the
// standalone `npm run migrate` CLI. Idempotent — migrations use IF NOT EXISTS
// / guarded renames, so re-running is safe.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pool } from './pool';

async function waitForDb(attempts = 15): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      console.log(`[migrate] database not ready yet (attempt ${i}/${attempts}) — retrying in 2s`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return false;
}

export async function applyMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('[migrate] DATABASE_URL is not set — skipping migrations');
    return;
  }
  if (!(await waitForDb())) {
    console.error('[migrate] database unreachable after retries — skipping migrations');
    return;
  }

  const dir = path.join(process.cwd(), 'db', 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    await pool.query(readFileSync(path.join(dir, file), 'utf8'));
    console.log(`[migrate] applied ${file}`);
  }
  console.log(`[migrate] done — ${files.length} migration(s) applied`);
}
