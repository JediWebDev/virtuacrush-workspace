// Dev-only per-character progress wipe — replay meet-cutes, arcs, and packs.
import { pool } from './pool';

export function isDevResetEnabled(): boolean {
  if (process.env.DISABLE_DEV_RESET === '1') return false;
  if (process.env.ALLOW_DEV_RESET === '1') return true;
  if (process.env.NODE_ENV === 'production') return false;
  return true;
}

/**
 * Clears all progression + chat state for one user/character pair so the meet-cute
 * and free-roam thread can be replayed from scratch. Dev / staging only.
 */
export async function resetCharacterDevState(userId: string, characterId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Pack threads (CASCADE deletes pack-scoped chat_messages).
    await client.query(
      `DELETE FROM pack_sessions WHERE user_id = $1 AND character_id = $2`,
      [userId, characterId],
    );

    // Free-roam chat.
    await client.query(
      `DELETE FROM chat_messages
       WHERE user_id = $1 AND character_id = $2 AND pack_session_id IS NULL`,
      [userId, characterId],
    );

    await client.query(
      `DELETE FROM arc_completions WHERE user_id = $1 AND character_id = $2`,
      [userId, characterId],
    );

    await client.query(
      `DELETE FROM chat_diary WHERE user_id = $1 AND character_id = $2`,
      [userId, characterId],
    );

    await client.query(
      `DELETE FROM character_posts WHERE user_id = $1 AND character_id = $2`,
      [userId, characterId],
    );

    await client.query(
      `DELETE FROM character_post_triggers WHERE user_id = $1 AND character_id = $2`,
      [userId, characterId],
    );

    await client.query(
      `DELETE FROM character_affinity WHERE user_id = $1 AND character_id = $2`,
      [userId, characterId],
    );

    await client.query(
      `DELETE FROM user_memory WHERE user_id = $1 AND source_character_id = $2`,
      [userId, characterId],
    );

    await client.query(
      `DELETE FROM npc_state WHERE user_id = $1 AND npc_id = $2`,
      [userId, characterId],
    );

    await client.query(
      `UPDATE character_state
          SET current_arc_id = NULL,
              active_arc_started_at = NULL,
              abandonment_strikes = 0,
              scene_composition = NULL,
              scene_mode = 'apart',
              scene_location = NULL,
              updated_at = NOW()
        WHERE user_id = $1 AND character_id = $2`,
      [userId, characterId],
    );

    await client.query(
      `DELETE FROM world_events WHERE user_id = $1`,
      [userId],
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
