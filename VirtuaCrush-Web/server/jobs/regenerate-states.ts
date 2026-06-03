// Scheduled batch job: refresh every stale character_state row so the first
// read of the day is instant. Safe to run repeatedly (idempotent per day).
// Schedule daily (e.g. cron "5 0 * * *") via: npm run jobs:regen-states
import { regenerateStaleStates } from '../db/state';
import { pool } from '../db/pool';

async function main() {
  const start = Date.now();
  const updated = await regenerateStaleStates();
  console.log(`[jobs] regenerate-states: refreshed ${updated} stale state(s) in ${Date.now() - start}ms`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('[jobs] regenerate-states failed:', err);
  process.exit(1);
});
