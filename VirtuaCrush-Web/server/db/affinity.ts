import { createChatCompletion } from '../lib/openrouter';
import { pool } from './pool';

export const AFFINITY_PER_MESSAGE = 0.2;
export const MAX_AFFINITY = 100;

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

type ToneBucket = 'loving' | 'caring' | 'neutral' | 'dismissive' | 'hostile';

const TONE_DELTAS: Record<ToneBucket, number> = {
  loving: 0.8,
  caring: 0.4,
  neutral: 0.1,
  dismissive: -0.3,
  hostile: -1.5,
};

/**
 * Classifies the emotional tone of a single user message and returns the
 * corresponding affinity delta. Falls back to the neutral delta on any error
 * so a classifier failure never breaks the chat flow.
 */
export async function classifyToneAndGetDelta(userMessage: string): Promise<number> {
  const systemPrompt = `You are a tone classifier for a companion chat app.
Classify the emotional tone of the user's message into exactly one of these five categories:
- loving: affectionate, romantic, deeply complimentary, expresses missing the character, strong positive emotion
- caring: warm, supportive, interested, asks about the character's wellbeing, friendly and kind
- neutral: casual conversation, small talk, questions about topics, factual exchanges, no strong emotional tone
- dismissive: cold, indifferent, one-word responses that show disinterest, ignoring or brushing off the character
- hostile: insulting, aggressive, using slurs, belittling, sexually harassing, threatening, or deliberately cruel

Respond with ONLY the single word label. No punctuation. No explanation.`;

  try {
    // migrated to OpenRouter (openrouter/owl-alpha)
    const text = await createChatCompletion({
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 10,
    });

    const raw = text.trim().toLowerCase() as ToneBucket;

    const delta = TONE_DELTAS[raw];
    if (delta === undefined) {
      console.warn(`[affinity] unexpected tone label: "${raw}", defaulting to neutral`);
      return TONE_DELTAS.neutral;
    }

    console.log(`[affinity] tone="${raw}" delta=${delta} msg="${userMessage.slice(0, 60)}"`);
    return delta;
  } catch (err) {
    console.error('[affinity] tone classification failed, defaulting to neutral:', err);
    return TONE_DELTAS.neutral;
  }
}
