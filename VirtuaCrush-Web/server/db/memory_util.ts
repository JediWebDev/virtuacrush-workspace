// Pure, dependency-free helpers for RAG memory: vector math, ranking, and
// parsing/formatting. Kept separate from memory.ts so they can be unit-tested
// without loading the native @inworld/runtime addon or a database.

/** How many facts to inject into a prompt by default. */
export const DEFAULT_MEMORY_TOP_K = 8;
/** Minimum cosine similarity for a memory to be considered relevant. */
export const MEMORY_SIMILARITY_FLOOR = 0.25;

export interface UserMemory {
  fact: string;
  embedding: number[];
}

// --- Extraction gate -----------------------------------------------------------
// Fact extraction costs a full LLM call per exchange; most messages ("haha",
// "what are you wearing", banter) contain nothing durable. This cheap heuristic
// decides whether the call is worth making: first-person + substantive topic,
// or a long message (where skipping risks losing real disclosures).

const FIRST_PERSON = /\b(i|i'm|im|i've|ive|i'?ll|my|mine|me)\b/i;
const SUBSTANCE =
  /\b(name(?:'s| is)?|work|job|career|boss|school|college|uni|class|study|studied|degree|live|lives|moved?|from|grew up|hometown|born|family|sister|brother|mom|mother|dad|father|parents?|kids?|son|daughter|wife|husband|girlfriend|boyfriend|fianc|ex\b|divorce|dog|cat|pet|birthday|years? old|allerg|favorite|favourite|hobby|hobbies|guitar|piano|gym|team|band|vegan|vegetarian|religio|christian|muslim|jewish|graduat|promot|fired|hired|surgery|diagnos)\b/i;

/** True when an LLM fact-extraction pass on this user message is worthwhile. */
export function seemsFactBearing(userText: string): boolean {
  const t = (userText ?? '').trim();
  if (t.length < 8) return false;
  if (t.length >= 200) return true; // long messages: be safe, extract
  return FIRST_PERSON.test(t) && SUBSTANCE.test(t);
}

/** Cosine similarity of two equal-length vectors. Returns 0 on bad input. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Ranks candidate memories against a query embedding and returns the top-K
 * facts above the similarity floor.
 */
export function rankMemories(
  queryEmbedding: number[],
  candidates: UserMemory[],
  k: number = DEFAULT_MEMORY_TOP_K,
  floor: number = MEMORY_SIMILARITY_FLOOR,
): string[] {
  return candidates
    .map((c) => ({ fact: c.fact, score: cosineSimilarity(queryEmbedding, c.embedding) }))
    .filter((c) => c.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, k))
    .map((c) => c.fact);
}

/** Parses an LLM fact-extraction response into a clean list of fact strings. */
export function parseFacts(raw: string | { text?: string; content?: string }): string[] {
  const text = typeof raw === 'string' ? raw : (raw?.content ?? raw?.text ?? '');
  if (!text) return [];

  // Pull out the first JSON array if the model wrapped it in prose/fences.
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let arr: unknown;
  try {
    arr = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const seen = new Set<string>();
  const facts: string[] = [];
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const fact = item.trim().replace(/\s+/g, ' ');
    if (fact.length < 3 || fact.length > 300) continue;
    const key = fact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
  }
  return facts;
}

/** Formats retrieved facts into a system-prompt memory block (or '' if none). */
export function formatMemoryBlock(facts: string[]): string {
  if (!facts || facts.length === 0) return '';
  return (
    `\n\nWHAT YOU REMEMBER ABOUT THIS USER (from past conversations — reference naturally, never list it back verbatim):\n` +
    facts.map((f) => `- ${f}`).join('\n')
  );
}
