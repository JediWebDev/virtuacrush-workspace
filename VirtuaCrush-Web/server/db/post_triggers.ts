import { pool } from './pool';

export async function hasPostTrigger(
  userId: string,
  characterId: string,
  triggerKey: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM character_post_triggers
     WHERE user_id = $1 AND character_id = $2 AND trigger_key = $3
     LIMIT 1`,
    [userId, characterId, triggerKey],
  );
  return rows.length > 0;
}

export async function recordPostTrigger(
  userId: string,
  characterId: string,
  triggerKey: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO character_post_triggers (user_id, character_id, trigger_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, character_id, trigger_key) DO NOTHING`,
    [userId, characterId, triggerKey],
  );
}
