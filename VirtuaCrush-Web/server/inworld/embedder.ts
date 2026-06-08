// Singleton text-embedding client for RAG memory.
// Uses the Inworld Runtime TextEmbedder primitive with a remote OpenAI-backed
// model, authenticated with the same INWORLD_API_KEY as the chat LLM. One
// instance is reused across requests; TextEmbedder.create() is expensive.
//
// The '@inworld/runtime' native addon is imported LAZILY so a deploy without an
// INWORLD_API_KEY (e.g. OpenRouter-only) never loads the native binary — memory
// just turns off and everything below fails soft to null.
import type { TextEmbedder } from '@inworld/runtime/primitives/embeddings';

let embedderPromise: Promise<TextEmbedder> | null = null;

function getEmbedder(): Promise<TextEmbedder> {
  if (!embedderPromise) {
    if (!process.env.INWORLD_API_KEY) {
      throw new Error('INWORLD_API_KEY is not set');
    }
    embedderPromise = import('@inworld/runtime/primitives/embeddings').then(({ TextEmbedder }) =>
      TextEmbedder.create({
        remoteConfig: {
          provider: process.env.INWORLD_EMBED_PROVIDER ?? 'openai',
          modelName: process.env.INWORLD_EMBED_MODEL ?? 'text-embedding-3-small',
          apiKey: process.env.INWORLD_API_KEY,
        },
      }),
    );
  }
  return embedderPromise;
}

/**
 * Embeds a single string into a vector. Returns null on failure so callers can
 * degrade gracefully (skip storing/retrieving a memory) instead of breaking chat.
 */
export async function embed(text: string): Promise<number[] | null> {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  try {
    const embedder = await getEmbedder();
    const res = await embedder.embed(trimmed);
    const vec = (res as { embedding?: number[] })?.embedding;
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  } catch (err) {
    console.warn('[embedder] embed failed:', err);
    return null;
  }
}

/**
 * Embeds many strings at once (more efficient than embed() in a loop).
 * Returns an array aligned with the input; entries are null on per-item failure.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const cleaned = texts.map((t) => t?.trim() ?? '');
  if (cleaned.every((t) => !t)) return texts.map(() => null);
  try {
    const embedder = await getEmbedder();
    const res = await embedder.embedBatch(cleaned);
    const vecs = (res as { embeddings?: number[][] })?.embeddings;
    if (!Array.isArray(vecs)) return texts.map(() => null);
    return cleaned.map((_, i) => {
      const v = vecs[i];
      return Array.isArray(v) && v.length > 0 ? v : null;
    });
  } catch (err) {
    console.warn('[embedder] embedBatch failed:', err);
    return texts.map(() => null);
  }
}
