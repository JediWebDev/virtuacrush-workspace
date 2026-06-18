// Story-state persistence and orchestration.
//
// Hybrid daily regeneration (lazy on read + scheduled batch). Per-user: one row per (user, character).
import { pool } from './pool';
import { getCharacter } from '../inworld/characters';
import { generateDailyState } from '../inworld/story_engine';
import { utcDateString, isStale, advanceProgress, type DailyState } from './story_util';
import type { SceneState } from './scene_util';

interface StateRow {
  character_id: string;
  state_date: string;
  activity: string;
  mood: string;
  headline: string;
  goal_progress: number;
  scene_location: string | null;
}

const COLS = `character_id, state_date::text AS state_date, activity, mood, headline, goal_progress, scene_location`;

export interface Situation {
  state: DailyState;
  scene: SceneState;
}

/** Strips a leading "Name is/was/'s " from a generated activity so the UI/prompt
 *  don't double it (e.g. "Becca is Becca is dusting"). */
function stripLeadingName(activity: string, name: string): string {
  if (!activity || !name) return activity;
  if (activity.toLowerCase().startsWith(name.toLowerCase())) {
    const rest = activity.slice(name.length).replace(/^\s*(?:'s|is|was)?\s*/i, '').trim();
    return rest || activity;
  }
  return activity;
}

function rowToState(r: StateRow): DailyState {
  let name = '';
  try { name = getCharacter(r.character_id).displayName; } catch { /* unknown id */ }
  return {
    activity: stripLeadingName(r.activity, name),
    mood: r.mood,
    headline: r.headline,
    goalProgress: Number(r.goal_progress) || 0,
  };
}

function rowToScene(r: StateRow): SceneState {
  return { location: r.scene_location ?? null };
}

async function readRow(userId: string, characterId: string): Promise<StateRow | null> {
  const { rows } = await pool.query<StateRow>(
    `SELECT ${COLS} FROM character_state WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId],
  );
  return rows[0] ?? null;
}

/** Generates a new daily state from the prior row and upserts it (scene resets to home). */
async function generateAndStore(
  userId: string,
  characterId: string,
  prior: StateRow | null,
  today: string,
): Promise<StateRow> {
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
       (user_id, character_id, state_date, activity, mood, headline, goal_progress, scene_location, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NOW())
     ON CONFLICT (user_id, character_id) DO UPDATE
       SET state_date = EXCLUDED.state_date,
           activity = EXCLUDED.activity,
           mood = EXCLUDED.mood,
           headline = EXCLUDED.headline,
           goal_progress = EXCLUDED.goal_progress,
           scene_location = NULL,
           updated_at = NOW()
     RETURNING ${COLS}`,
    [userId, characterId, today, generated.activity, generated.mood, generated.headline, goalProgress],
  );
  return rows[0];
}

/** Ensures a fresh (today's) state row exists, regenerating if stale. Never throws. */
async function ensureFreshRow(userId: string, characterId: string): Promise<StateRow> {
  const today = utcDateString();
  const row = await readRow(userId, characterId);
  if (row && !isStale(row.state_date, today)) return row;
  try {
    return await generateAndStore(userId, characterId, row, today);
  } catch (err) {
    console.warn('[state] generate failed; serving prior/empty state:', err);
    return (
      row ?? {
        character_id: characterId,
        state_date: today,
        activity: '',
        mood: '',
        headline: '',
        goal_progress: 0,
        scene_location: null,
      }
    );
  }
}

/** Ensures a character_state row exists so arc/scene updates never no-op. */
export async function ensureCharacterStateRow(userId: string, characterId: string): Promise<void> {
  const today = utcDateString();
  await pool.query(
    `INSERT INTO character_state
       (user_id, character_id, state_date, activity, mood, headline, goal_progress, updated_at)
     VALUES ($1, $2, $3, '', '', '', 0, NOW())
     ON CONFLICT (user_id, character_id) DO NOTHING`,
    [userId, characterId, today],
  );
}

/** Clears composed scene cache so the next turn recomposes (e.g. after arc play). */
export async function resetSceneComposition(userId: string, characterId: string): Promise<void> {
  await pool.query(
    `UPDATE character_state SET scene_composition = NULL, updated_at = NOW()
     WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId],
  );
}
/** Current daily state for this user/character (lazily generated on a new day). */
export async function getOrGenerateDailyState(
  userId: string,
  characterId: string,
): Promise<DailyState> {
  return rowToState(await ensureFreshRow(userId, characterId));
}

/** Current daily state AND scene together (one read). */
export async function getSituation(userId: string, characterId: string): Promise<Situation> {
  const row = await ensureFreshRow(userId, characterId);
  return { state: rowToState(row), scene: rowToScene(row) };
}

/** Reads just the scene (assumes a row exists; returns home default if not). */
export async function getScene(userId: string, characterId: string): Promise<SceneState> {
  const row = await readRow(userId, characterId);
  if (!row) return { location: null };
  return rowToScene(row);
}

/** Updates the character's mood for this user. */
export async function setMood(userId: string, characterId: string, mood: string): Promise<void> {
  await pool.query(
    `UPDATE character_state SET mood = $3, updated_at = NOW()
     WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId, mood],
  );
}

/** Moves the player to a location (or back home with null). Clears scene_composition to force recompose. */
export async function setSceneLocation(
  userId: string,
  characterId: string,
  locationSlug: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE character_state
       SET scene_location = $3, scene_composition = NULL, updated_at = NOW()
     WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId, locationSlug],
  );
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
