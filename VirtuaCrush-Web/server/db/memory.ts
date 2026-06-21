// Long-term memory: RAG over durable facts about the user.
//
// Pipeline:
//   1. After each chat exchange, extractAndStoreFacts() asks the LLM to pull
//      durable facts about the USER (name, life moments, personal details),
//      embeds each new fact, and stores it in `user_memory`.
//   2. Before generating a reply, retrieveRelevantMemories() embeds the user's
//      latest message and returns the top-K most similar stored facts, which
//      the chat route injects into the system prompt.
//
// Pure helpers (vector math, ranking, parsing, formatting) live in
// memory_util.ts so they are testable without the native runtime or a DB.
// Everything here fails soft: a memory hiccup must never break chat.
import { pool } from './pool';
import { completePrompt } from '../llm';
import { embed } from '../inworld/embedder';
import {
  rankMemories,
  parseFacts,
  seemsFactBearing,
  DEFAULT_MEMORY_TOP_K,
  type UserMemory,
} from './memory_util';

// Re-export the pure helpers so existing import sites (and tests) can pull them
// from either module.
export {
  cosineSimilarity,
  rankMemories,
  parseFacts,
  formatMemoryBlock,
  DEFAULT_MEMORY_TOP_K,
  MEMORY_SIMILARITY_FLOOR,
  type UserMemory,
} from './memory_util';

// --- Fact extraction ---------------------------------------------------------

const FACT_EXTRACTION_PROMPT = `You maintain a long-term memory of durable facts about a user in a companion-chat app.
From the latest exchange below, extract ONLY stable, personal facts worth remembering long-term about the USER — their name, where they live or work, relationships, pets, goals, significant life events, strong preferences, and similar.

Rules:
- Write each fact as a short, self-contained third-person statement, e.g. "User's name is Andrew." or "User adopted a dog named Biscuit."
- Extract facts about the USER, not the assistant/character.
- Ignore small talk, transient mood, opinions about the conversation, and anything not durable.
- IGNORE environmental interruptions, phone notifications, sudden NPC exits, mid-scene disruptions, authority warnings, police arrivals, and other scripted world events — the simulation engine records those separately. Do not extract them as user facts even if they appear in the assistant reply.
- If there is nothing worth remembering, return an empty array.
- Respond with ONLY a JSON array of strings. No prose, no markdown fences.

USER message:
"""
{{USER}}
"""

ASSISTANT reply:
"""
{{ASSISTANT}}
"""

JSON array:`;

async function extractFacts(userMessage: string, assistantMessage: string): Promise<string[]> {
  try {
    const prompt = FACT_EXTRACTION_PROMPT.replace('{{USER}}', userMessage.slice(0, 4000)).replace(
      '{{ASSISTANT}}',
      assistantMessage.slice(0, 4000),
    );
    // JSON mode keeps extraction parseable; parseFacts also tolerates an
    // object wrapper like {"facts": [...]} since it pulls the first array.
    const result = await completePrompt(prompt, { json: true });
    return parseFacts(result);
  } catch (err) {
    console.warn('[memory] fact extraction failed:', err);
    return [];
  }
}

/**
 * Extracts durable facts from one exchange, embeds the new ones, and stores
 * them. Intended to be fire-and-forget from the chat route (don't await on the
 * response path). Never throws.
 */
export async function extractAndStoreFacts(params: {
  userId: string;
  characterId: string;
  userMessage: string;
  assistantMessage: string;
}): Promise<void> {
  try {
    // Token conservation: skip the extraction LLM call entirely when the user
    // message clearly carries nothing durable (most messages don't).
    if (!seemsFactBearing(params.userMessage)) return;

    const facts = await extractFacts(params.userMessage, params.assistantMessage);
    if (facts.length === 0) return;

    // Skip facts we already store for this user (cheap pre-check; the UNIQUE
    // constraint is the real guard against races).
    const { rows } = await pool.query<{ fact: string }>(
      `SELECT fact FROM user_memory WHERE user_id = $1`,
      [params.userId],
    );
    const existing = new Set(rows.map((r) => r.fact.toLowerCase()));
    const fresh = facts.filter((f) => !existing.has(f.toLowerCase()));
    if (fresh.length === 0) return;

    for (const fact of fresh) {
      const vector = await embed(fact);
      if (!vector) continue; // embedding unavailable — skip rather than store junk
      await pool.query(
        `INSERT INTO user_memory (user_id, source_character_id, fact, embedding)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (user_id, fact) DO NOTHING`,
        [params.userId, params.characterId, fact, JSON.stringify(vector)],
      );
    }
    console.log(
      `[memory] stored ${fresh.length} new fact(s) for user=${params.userId} character=${params.characterId}`,
    );
  } catch (err) {
    console.warn('[memory] extractAndStoreFacts failed:', err);
  }
}

// --- Retrieval ---------------------------------------------------------------

/**
 * Returns the most relevant stored facts for the user's current message.
 * Facts are user-scoped (every character can recall the user's name, etc.).
 * Returns [] on any failure so chat proceeds without memory.
 */
export async function retrieveRelevantMemories(params: {
  userId: string;
  queryText: string;
  /** When set, only facts from this companion (or global user facts) are returned. */
  characterId?: string;
  k?: number;
}): Promise<string[]> {
  try {
    const queryEmbedding = await embed(params.queryText);
    if (!queryEmbedding) return [];

    const { rows } = await pool.query<{ fact: string; embedding: number[] }>(
      params.characterId
        ? `SELECT fact, embedding FROM user_memory
           WHERE user_id = $1 AND (source_character_id IS NULL OR source_character_id = $2)`
        : `SELECT fact, embedding FROM user_memory WHERE user_id = $1`,
      params.characterId ? [params.userId, params.characterId] : [params.userId],
    );
    if (rows.length === 0) return [];

    const candidates: UserMemory[] = rows.map((r) => ({
      fact: r.fact,
      // pg returns jsonb as a parsed JS value already.
      embedding: Array.isArray(r.embedding) ? r.embedding : [],
    }));
    return rankMemories(queryEmbedding, candidates, params.k ?? DEFAULT_MEMORY_TOP_K);
  } catch (err) {
    console.warn('[memory] retrieveRelevantMemories failed:', err);
    return [];
  }
}

/**
 * Stores a one-off significant event (e.g. on-date chaos/crime) as a durable
 * memory so the character remembers it later. Fire-and-forget; never throws.
 */
export async function storeSignificantEvent(
  userId: string,
  characterId: string,
  text: string,
): Promise<void> {
  try {
    const clean = text.trim().slice(0, 300);
    if (!clean) return;
    const vector = await embed(clean);
    if (!vector) return;
    await pool.query(
      `INSERT INTO user_memory (user_id, source_character_id, fact, embedding)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (user_id, fact) DO NOTHING`,
      [userId, characterId, clean, JSON.stringify(vector)],
    );
    console.log(`[memory] stored significant event for user=${userId} character=${characterId}`);
  } catch (err) {
    console.warn('[memory] storeSignificantEvent failed:', err);
  }
}

// --- Admin / debug helpers ---------------------------------------------------

export interface StoredMemory {
  id: string;
  fact: string;
  sourceCharacterId: string | null;
  createdAt: string;
}

/** Lists all stored facts for a user, newest first. */
export async function listMemories(userId: string): Promise<StoredMemory[]> {
  const { rows } = await pool.query<{
    id: string;
    fact: string;
    source_character_id: string | null;
    created_at: string;
  }>(
    `SELECT id, fact, source_character_id, created_at
     FROM user_memory
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    fact: r.fact,
    sourceCharacterId: r.source_character_id,
    createdAt: r.created_at,
  }));
}

/** Deletes one fact by id, scoped to the user. Returns true if a row was removed. */
export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM user_memory WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return (rowCount ?? 0) > 0;
}

/** Deletes all facts for a user. Returns the number of rows removed. */
export async function clearMemories(userId: string): Promise<number> {
  const { rowCount } = await pool.query(`DELETE FROM user_memory WHERE user_id = $1`, [userId]);
  return rowCount ?? 0;
}
