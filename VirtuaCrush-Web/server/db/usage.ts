import { pool } from './pool';

// Free-tier daily message cap. Override with FREE_TIER_DAILY_LIMIT (e.g. set it
// high on your host while testing). Defaults to 5 for real free users.
export const FREE_TIER_DAILY_LIMIT = Math.max(1, Number(process.env.FREE_TIER_DAILY_LIMIT ?? 35));

/**
 * Returns today's message count for a user (UTC day boundary).
 * Returns 0 if no row exists yet.
 */
export async function getTodayUsage(userId: string): Promise<number> {
  const { rows } = await pool.query<{ message_count: number }>(
    `SELECT message_count FROM message_usage
     WHERE user_id = $1 AND usage_date = (CURRENT_DATE AT TIME ZONE 'UTC')`,
    [userId],
  );
  return rows[0]?.message_count ?? 0;
}

/**
 * Atomic increment with upsert. Returns the new count after increment.
 * Using ON CONFLICT keeps this race-safe under concurrent requests.
 */
export async function incrementUsage(userId: string): Promise<number> {
  const { rows } = await pool.query<{ message_count: number }>(
    `INSERT INTO message_usage (user_id, usage_date, message_count)
     VALUES ($1, (CURRENT_DATE AT TIME ZONE 'UTC'), 1)
     ON CONFLICT (user_id, usage_date)
     DO UPDATE SET message_count = message_usage.message_count + 1
     RETURNING message_count`,
    [userId],
  );
  return rows[0].message_count;
}