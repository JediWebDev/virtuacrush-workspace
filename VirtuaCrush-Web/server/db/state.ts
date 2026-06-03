// Story-state persistence + orchestration.
//
// Hybrid regeneration:
//   - Lazy (compute-on-read): getOrGenerateDailyState() generates and caches a
//     fresh state the first time it's read on a new day. Guarantees correctness
//     even with no scheduler.
//   - Batch (scheduled): regenerateStaleStates() refreshes all stale rows ahead
//     of time so the first read of the day is instant. Run from a cron/job.
//
// Per-user: one row per (user, character); the storyline diverges per player.
import { pool } from './pool';
import { getCharacter } from '../inworld/characters';
import { generateDailyState } from '../inworld/story_engine';
import {
  utcDateString,
  isStale,
  advanceProgress,
  type DailyState,
} from './story_util';

interface StateRow {
  character_id: string;
  state_date: string;
  activity: string;
  mood: string;
  headline: string;
  goal_progress: number;
}

function rowToState(r: StateRow): DailyState {
  return {
    activity: r.activity,
    mood: r.mood,
    headline: r.headline,
    goalProgress: Number(r.goal_progress) || 0,
  };
}

async function readRow(userId: string, characterId: string): Promise<StateRow | null> {
  const { rows } = await pool.query<StateRow>(
    `SELECT character_id, state_date, activity, mood, headline, goal_progress
     FROM character_state WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId],
  );
  return rows[0] ?? null;
}

/** Generates a new daily state from the prior row and upserts it. Returns the new state. */
async function generateAndStore(
  userId: string,
  characterId: string,
  prior: StateRow | null,
  today: string,
): Promise<DailyState> {
  const character = getCharacter(characterId); // throws on unknown id
  const generated = await generateDailyState({
    characterId,
    displayName: character.displayName,
    prior: prior
      ? { activity: prior.activity, mood: prior.mood, goalProgress: Number(prior.goal_progress) || 0 }
      : null,
    today,
  });
  const goalProgress = advanceProgress(prior ? Number(prior.goal_progress) || 0 : 0, generated.goalDelta);

  const { rows } = await pool.query<StateRow>(
    `INSERT INTO character_state
       (user_id, character_id, state_date, activity, mood, headline, goal_progress, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id, character_id) DO UPDATE
       SET state_date = EXCLUDED.state_date,
           activity = EXCLUDED.activity,
           mood = EXCLUDED.mood,
           headline = EXCLUDED.headline,
           goal_progress = EXCLUDED.goal_progress,
           updated_at = NOW()
     RETURNING character_id, state_date, activity, mood, headline, goal_progress`,
    [userId, characterId, today, generated.activity, generated.mood, generated.headline, goalProgress],
  );
  return rowToState(rows[0]);
}

/**
 * Returns the character's current daily state for this user, generating (and
 * caching) a fresh one if none exists or the stored one is from a previous day.
 * Falls back to the stale row if generation throws, so chat/UI never breaks.
 */
export async function getOrGenerateDailyState(
  userId: string,
  characterId: string,
): Promise<DailyState> {
  const today = utcDateString();
  const row = await readRow(userId, characterId);
  if (row && !isStale(row.state_date, today)) {
    return rowToState(row);
  }
  try {
    return await generateAndStore(userId, characterId, row, today);
  } catch (err) {
    console.warn('[state] generate failed; serving prior/empty state:', err);
    return row
      ? rowToState(row)
      : { activity: '', mood: '', headline: '', goalProgress: 0 };
  }
}

/**
 * Batch refresh of all stale rows (run from a scheduled job). Regenerates each
 * (user, character) whose state_date is before today. Returns the count updated.
 */
export async function regenerateStaleStates(limit = 500): Promise<number> {
  const today = utcDateString();
  const { rows } = await pool.query<{ user_id: string; character_id: string }>(
    `SELECT user_id, character_id FROM character_state
     WHERE state_date < $1::date
     ORDER BY state_date ASC
     LIMIT $2`,
    [today, limit],
  );
  let updated = 0;
  for (const { user_id, character_id } of rows) {
    try {
      const prior = await readRow(user_id, character_id);
      await generateAndStore(user_id, character_id, prior, today);
      updated++;
    } catch (err) {
      console.warn(`[state] batch regen failed for ${user_id}/${character_id}:`, err);
    }
  }
  return updated;
}

/**
 * Adjusts the user's goal progress for a character by delta, clamped to
 * [0, 100]. Returns the new progress (or 0 if no state row exists yet).
 */
export async function bumpGoalProgress(
  userId: string,
  characterId: string,
  delta: number,
): Promise<number> {
  const { rows } = await pool.query<{ goal_progress: number }>(
    `UPDATE character_state
       SET goal_progress = LEAST(GREATEST(goal_progress + $3, 0), 100), updated_at = NOW()
     WHERE user_id = $1 AND character_id = $2
     RETURNING goal_progress`,
    [userId, characterId, Math.round(delta)],
  );
  return rows[0] ? Number(rows[0].goal_progress) : 0;
}
