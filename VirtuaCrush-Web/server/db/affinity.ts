import { pool } from './pool';

export const AFFINITY_PER_MESSAGE = 0.2;
export const MAX_AFFINITY = 100;

/** Largest single-message penalty an abusive message can incur. */
export const MAX_ABUSE_PENALTY = 5;
/**
 * Combined severity (0..1) at or above which a message is penalized. Below this,
 * every message earns the base engagement increment — normal chat and small
 * talk never reduce affinity. Only explicit abuse / vulgarity crosses it.
 */
export const PENALTY_FLOOR = 0.5;
/**
 * The LLM classifier only contributes toward a penalty when AT LEAST this
 * confident. Its noisy mid-range scores on benign messages are ignored, so
 * small talk can never trigger a drop because of classifier nondeterminism.
 */
export const CLASSIFIER_CONFIDENCE = 0.85;

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
    return delta;
  }

  if (NEGATIVE_BEHAVIORS.has(behavior)) {
    const delta = -magnitude;
    return delta;
  }

  return 0;
}

// --- User-message hostility scoring (hybrid: heuristic + LLM classifier) -----
//
// Policy: affinity only drops on EXPLICIT verbal abuse or vulgar content.
// Everything else — including all normal small talk — earns the base increment.
// The deterministic heuristic below is the authoritative trigger; the LLM
// classifier is only a high-confidence backstop for obfuscated abuse it misses.
//
// All matching is word-boundary based (regex \b), never substring, so benign
// words can't trip a slur (e.g. "indie" must not match "die", "grape" must not
// match "rape", "Scunthorpe" must not match "cunt").

// Severe abuse: slurs, threats, self-harm directives. Always abusive
// regardless of how they're phrased. Score 1.0.
const SEVERE_ABUSE: RegExp[] = [
  /\bk+ys+\b/i,                                   // kys / kyss
  /\bkill (your\s?self|yourself|urself|u|you)\b/i,
  /\bgo (die|kill yourself)\b/i,
  /\bn[i1]gg(er|a|ers|as)\b/i,
  /\bfagg?(ot|ots|s)?\b/i,
  /\bretard(ed|s)?\b/i,
  /\bcunts?\b/i,
  /\btrann(y|ies)\b/i,
  /\b(kike|spic|chink|wetback|coon)s?\b/i,
  /\brap(e|ed|ing|ist)\b/i,
];

// Directed insults at the character ("you are an idiot", "you're a fucking
// moron"). Score 0.7. An optional profanity intensifier is allowed.
const INSULT_PATTERN =
  /\byou(?:'re|\s+are|\s+r)?\s+(?:a\s+|an\s+|such\s+a\s+|so\s+|really\s+|just\s+)?(?:f+u+c+k+ing\s+|f+ing\s+|freaking\s+|fricking\s+|damn\s+|goddamn\s+)?(?:stupid|dumb|idiot|moron|ugly|worthless|useless|pathetic|trash|garbage|disgusting|annoying|boring|brain ?dead|loser)\b/i;

// Vulgarity DIRECTED AT the character — profanity aimed at them, not casual
// swearing. Score 0.8. Plain profanity in conversation ("oh shit", "this is
// fucking awesome") deliberately does NOT match and is treated as normal chat.
const DIRECTED_VULGAR: RegExp[] = [
  /\bf+u+c+k+\s+(you|u|off|ya|y'?all|yourself|urself)\b/i,   // fuck you / off / yourself
  /\bgo\s+f+u+c+k+\s+(yourself|urself|you)\b/i,             // go fuck yourself
  /\bscrew\s+(you|u|off)\b/i,                               // screw you / off
  /\bshut\s+the\s+f+u+c+k+\s+up\b/i,                       // shut the fuck up
  /\bf\s+u\b/i,                                             // "f u"
  /\beat\s+(shit|a\s+dick)\b/i,                             // eat shit / a dick
  /\bpiece\s+of\s+(shit|crap)\b/i,                          // piece of shit
  // "you('re) (a) (fucking) <vulgar noun>"
  /\byou(?:'re|\s+are|\s+r)?\s+(?:a\s+|an\s+|such\s+a\s+|so\s+|really\s+|just\s+|f+u+c+k+ing\s+|freaking\s+|damn\s+)?(?:bitch|ass\s?hole|dick(?:head)?|prick|slut|whore|bastard|douche(?:bag)?|jack\s?ass|twat|wanker|pig|scum)\b/i,
];

/**
 * Cheap, synchronous hostility estimate for a user message in [0, 1].
 * Word-boundary matched so benign words never trip a term. Returns 0 for normal
 * text (including casual profanity), 0.7 for directed insults, 0.8 for vulgarity
 * directed at the character, and 1.0 for severe abuse / slurs.
 */
export function heuristicHostility(message: string): number {
  if (!message) return 0;
  if (SEVERE_ABUSE.some((re) => re.test(message))) return 1;
  if (DIRECTED_VULGAR.some((re) => re.test(message))) return 0.8;
  if (INSULT_PATTERN.test(message)) return 0.7;
  return 0;
}

/**
 * Combines the deterministic heuristic with the (optional) LLM classifier into
 * a single affinity delta for a user message.
 *
 * - Normal messages (including all small talk and casual profanity) earn
 *   +AFFINITY_PER_MESSAGE.
 * - Only when severity >= PENALTY_FLOOR (explicit abuse / directed vulgarity, or
 *   a very-high-confidence classifier hit) is the message penalized, scaling
 *   from a gentle dip up to -MAX_ABUSE_PENALTY for the worst messages.
 *
 * The classifier only counts when >= CLASSIFIER_CONFIDENCE, so its noisy
 * mid-range scores on benign messages can never cause a drop.
 *
 * `classifierHostility` is the 0..1 score from classifyHostility(); pass
 * undefined/null if the classifier was unavailable (the heuristic still applies).
 */
export function getAffinityDeltaFromUserMessage(
  message: string,
  classifierHostility?: number | null,
): number {
  const heuristic = heuristicHostility(message);
  const classifierRaw =
    typeof classifierHostility === 'number' && Number.isFinite(classifierHostility)
      ? Math.max(0, Math.min(1, classifierHostility))
      : 0;
  // Only a confident classifier counts; otherwise ignore it entirely.
  const classifierSignal = classifierRaw >= CLASSIFIER_CONFIDENCE ? classifierRaw : 0;
  const severity = Math.max(heuristic, classifierSignal);

  if (severity < PENALTY_FLOOR) {
    return AFFINITY_PER_MESSAGE;
  }

  // Map severity [floor..1] -> penalty [-1 .. -MAX_ABUSE_PENALTY].
  const scaled = (severity - PENALTY_FLOOR) / (1 - PENALTY_FLOOR);
  const delta = -(1 + scaled * (MAX_ABUSE_PENALTY - 1));
  console.log(
    `[affinity] hostility heuristic=${heuristic.toFixed(2)} classifier=${classifierRaw.toFixed(2)} ` +
      `severity=${severity.toFixed(2)} delta=${delta.toFixed(2)}`,
  );
  return delta;
}
