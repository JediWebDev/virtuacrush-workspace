// Arc runtime state: read/write helpers for the three arc columns on
// character_state and the arc_completions ledger table.
import { pool } from './pool';
import { ensureCharacterStateRow } from './state';
import type { StoryArc } from '../inworld/arcs';

export interface ArcState {
  currentArcId: string | null;
  activeArcStartedAt: Date | null;
  abandonmentStrikes: number;
}

interface ArcStateRow {
  current_arc_id: string | null;
  active_arc_started_at: Date | null;
  abandonment_strikes: number;
}

// ---------------------------------------------------------------------------
// Arc state queries
// ---------------------------------------------------------------------------

/** Returns the active arc runtime state for a user/character pair. */
export async function getArcState(userId: string, characterId: string): Promise<ArcState> {
  const res = await pool.query<ArcStateRow>(
    `SELECT current_arc_id, active_arc_started_at, abandonment_strikes
       FROM character_state
      WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId],
  );
  const row = res.rows[0];
  if (!row) {
    return { currentArcId: null, activeArcStartedAt: null, abandonmentStrikes: 0 };
  }
  return {
    currentArcId: row.current_arc_id,
    activeArcStartedAt: row.active_arc_started_at,
    abandonmentStrikes: row.abandonment_strikes,
  };
}

/** Activates an arc: sets current_arc_id, stamps started_at, resets strikes. */
export async function setArcActive(
  userId: string,
  characterId: string,
  arcId: string,
): Promise<void> {
  await ensureCharacterStateRow(userId, characterId);
  const res = await pool.query(
    `UPDATE character_state
        SET current_arc_id        = $3,
            active_arc_started_at = NOW(),
            abandonment_strikes   = 0,
            updated_at            = NOW()
      WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId, arcId],
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new Error(`setArcActive: no character_state row for ${characterId}`);
  }
}

/** Clears the active arc and resets all arc tracking columns. */
export async function clearArc(userId: string, characterId: string): Promise<void> {
  await pool.query(
    `UPDATE character_state
        SET current_arc_id        = NULL,
            active_arc_started_at = NULL,
            abandonment_strikes   = 0
      WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId],
  );
}

/** Adds one abandonment strike; returns the new total. */
export async function incrementAbandonmentStrikes(
  userId: string,
  characterId: string,
): Promise<number> {
  const res = await pool.query<{ abandonment_strikes: number }>(
    `UPDATE character_state
        SET abandonment_strikes = abandonment_strikes + 1
      WHERE user_id = $1 AND character_id = $2
  RETURNING abandonment_strikes`,
    [userId, characterId],
  );
  return res.rows[0]?.abandonment_strikes ?? 0;
}

/** Resets abandonment strikes to zero (call when player re-engages with the arc). */
export async function resetAbandonmentStrikes(
  userId: string,
  characterId: string,
): Promise<void> {
  await pool.query(
    `UPDATE character_state
        SET abandonment_strikes = 0
      WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId],
  );
}

// ---------------------------------------------------------------------------
// Arc completions ledger
// ---------------------------------------------------------------------------

/**
 * Records a completed arc. ON CONFLICT DO NOTHING makes this idempotent —
 * a duplicate completion signal on the same turn won't create a second row.
 */
export async function saveCompletedArc(
  userId: string,
  characterId: string,
  arc: StoryArc,
  badge: { title: string; description: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO arc_completions
       (user_id, character_id, arc_id, badge_title, badge_description, tone)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, character_id, arc_id) DO NOTHING`,
    [userId, characterId, arc.id, badge.title, badge.description, arc.tone],
  );
}

/**
 * Returns the set of arc IDs the user has already completed for this character.
 * Used by selectArc() to filter out non-repeatable arcs.
 */
export async function getCompletedArcIds(
  userId: string,
  characterId: string,
): Promise<Set<string>> {
  const res = await pool.query<{ arc_id: string }>(
    `SELECT arc_id FROM arc_completions WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId],
  );
  return new Set(res.rows.map((r) => r.arc_id));
}
