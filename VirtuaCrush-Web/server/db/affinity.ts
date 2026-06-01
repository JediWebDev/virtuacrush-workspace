import { pool } from './pool';

export const AFFINITY_PER_MESSAGE = 0.2;
export const MAX_AFFINITY = 100;

/** Largest single-message penalty an abusive message can incur. */
export const MAX_ABUSE_PENALTY = 5;
/**
 * Combined hostility score (0..1) at or above which a message is treated as
 * abusive and penalized instead of earning the base engagement increment.
 */
export const HOSTILITY_THRESHOLD = 0.3;

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
     VALUES ($1, $2, LEAST(GREATEST($3::numeric, 0), $4))
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

// --- User-message hostility scoring (hybrid: heuristic + LLM classifier) ---

// Obvious slurs / strongly abusive terms. A single hit is enough to flag a
// message as abusive without waiting on the classifier. Kept intentionally
// small and high-precision; the LLM classifier handles nuance and context.
const STRONG_ABUSE_TERMS = [
  'kill yourself',
  'kys',
  'die',
  'retard',
  'whore',
  'slut',
  'bitch',
  'cunt',
  'faggot',
  'fag',
  'nigger',
  'rape',
];

// Common insult patterns directed at the character ("you are an idiot", etc.).
const INSULT_PATTERN =
  /\byou(?:'re|\s+are|\s+r)?\s+(?:a\s+|an\s+|such\s+a\s+|so\s+|really\s+)?(?:stupid|dumb|idiot|moron|ugly|worthless|useless|pathetic|trash|garbage|disgusting|annoying)\b/i;

/**
 * Cheap, synchronous hostility estimate for a user message in [0, 1].
 * Catches obvious abuse with zero latency/cost. Returns 0 for normal text.
 */
export function heuristicHostility(message: string): number {
  if (!message) return 0;
  const text = message.toLowerCase();

  for (const term of STRONG_ABUSE_TERMS) {
    if (text.includes(term)) return 1;
  }

  if (INSULT_PATTERN.test(message)) return 0.7;

  return 0;
}

/**
 * Combines the synchronous heuristic with an (optional) LLM classifier score
 * into a single affinity delta for a user message.
 *
 * - Normal messages earn the small base engagement increment (+0.2).
 * - Messages whose combined hostility >= HOSTILITY_THRESHOLD are penalized,
 *   scaling from a small dip up to -MAX_ABUSE_PENALTY for the worst messages.
 *
 * `classifierHostility` is the 0..1 score from classifyHostility(); pass
 * undefined/null if the classifier was unavailable (heuristic still applies).
 */
export function getAffinityDeltaFromUserMessage(
  message: string,
  classifierHostility?: number | null,
): number {
  const heuristic = heuristicHostility(message);
  const classifier =
    typeof classifierHostility === 'number' && Number.isFinite(classifierHostility)
      ? Math.max(0, Math.min(1, classifierHostility))
      : 0;
  const hostility = Math.max(heuristic, classifier);

  if (hostility < HOSTILITY_THRESHOLD) {
    return AFFINITY_PER_MESSAGE;
  }

  // Map hostility [threshold..1] -> penalty [~ -1 .. -MAX_ABUSE_PENALTY].
  const scaled = (hostility - HOSTILITY_THRESHOLD) / (1 - HOSTILITY_THRESHOLD);
  const delta = -(1 + scaled * (MAX_ABUSE_PENALTY - 1));
  console.log(
    `[affinity] hostility heuristic=${heuristic.toFixed(2)} classifier=${classifier.toFixed(2)} ` +
      `combined=${hostility.toFixed(2)} delta=${delta.toFixed(2)}`,
  );
  return delta;
}
