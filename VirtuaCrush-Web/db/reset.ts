// Node-based dev reset (no psql binary required).
// Wipes conversation state (chat_messages, character_affinity, user_memory,
// character_state) while leaving auth/user/subscription tables intact.
//
// Run with: npm run db:reset
import 'dotenv/config';
import { pool } from '../server/db/pool';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[reset] DATABASE_URL is not set (check your .env)');
    process.exit(1);
  }
  await pool.query(
    `TRUNCATE TABLE chat_messages, character_affinity, user_memory, character_state, dialogue_choices, character_posts RESTART IDENTITY`,
  );
  await pool.end();
  console.log('[reset] conversation data cleared');
  process.exit(0);
}

main().catch((err) => {
  console.error('[reset] failed:', err);
  process.exit(1);
});
