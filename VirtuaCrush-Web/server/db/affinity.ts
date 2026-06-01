import { pool } from './pool';

export const AFFINITY_PER_MESSAGE = 0.2;
export const MAX_AFFINITY = 100;

/** Emotion packet from Inworld's streaming LLM response. */
export interface InworldEmotionEvent {
  behavior: string;
  strength: number;
}

const POSITIVE_BEHAVIORS = new Set(['JOY', 'AFFECTION', 'AMUSEMENT']);
const NEGATIVE_BEHAVIORS = new Set(['ANGER', 'SADNESS', 'DISGUST']);
const NEUTRAL_BEHAVIORS = new Set(['NEUTRAL']);

/**
 * Returns the current affinity score for a user/character pair.
 * Returns 0 if no row exists yet.
 */
export async function getAffinity(userId: string, characterId: string): Promise<number> {
  const { rows } = await pool.query<{ score: string }>(
    `SELECT score FROM character_affinity WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId],
  );
  return rows[0] ? parseFloat(rows[0].score) : 0;
}

/**
 * Atomically increments affinity by delta, clamped to [0, MAX_AFFINITY].
 * Returns the new score.
 */
export async function incrementAffinity(
  userId: string,
  characterId: string,
  delta: number = AFFINITY_PER_MESSAGE,
): Promise<number> {
  const { rows } = await pool.query<{ score: string }>(
    `INSERT INTO character_affinity (user_id, character_id, score)
     VALUES ($1, $2, LEAST($3::numeric, $4))
     ON CONFLICT (user_id, character_id) DO UPDATE
       SET score = LEAST(
             GREATEST(character_affinity.score + $3::numeric, 0),
             $4
           ),
           updated_at = NOW()
     RETURNING score`,
    [userId, characterId, delta, MAX_AFFINITY],
  );
  return parseFloat(rows[0].score);
}

/**
 * Returns all affinity rows for a user as a { characterId -> score } map.
 */
export async function getAllAffinity(userId: string): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ character_id: string; score: string }>(
    `SELECT character_id, score FROM character_affinity WHERE user_id = $1`,
    [userId],
  );
  return Object.fromEntries(rows.map((r) => [r.character_id, parseFloat(r.score)]));
}

function normalizeStrength(strength: number): number {
  if (!Number.isFinite(strength)) return 0;
  if (strength > 1) return Math.min(strength / 100, 1);
  return Math.max(0, Math.min(1, strength));
}

/**
 * Maps Inworld emotionEvent (behavior + strength) to an affinity delta (+1..+3, -1..-3, or 0).
 * Missing or unknown events return 0 so chat never crashes.
 */
export function getAffinityDeltaFromEmotion(
  emotionEvent?: InworldEmotionEvent | null,
): number {
  if (!emotionEvent?.behavior) {
    return 0;
  }

  const behavior = emotionEvent.behavior.trim().toUpperCase();
  const magnitude = 1 + normalizeStrength(emotionEvent.strength) * 2;

  if (NEUTRAL_BEHAVIORS.has(behavior)) {
    return 0;
  }

  if (POSITIVE_BEHAVIORS.has(behavior)) {
    const delta = magnitude;
    console.log(
      `[affinity] behavior="${behavior}" strength=${emotionEvent.strength} delta=+${delta.toFixed(2)}`,
    );
    return delta;
  }

  if (NEGATIVE_BEHAVIORS.has(behavior)) {
    const delta = -magnitude;
    console.log(
      `[affinity] behavior="${behavior}" strength=${emotionEvent.strength} delta=${delta.toFixed(2)}`,
    );
    return delta;
  }

  console.warn(`[affinity] unknown behavior "${behavior}", delta=0`);
  return 0;
}
