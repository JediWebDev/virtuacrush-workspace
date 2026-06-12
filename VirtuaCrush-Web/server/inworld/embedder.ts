// Text-embedding client for RAG memory — OpenAI-compatible endpoint.
// Works with OpenRouter (https://openrouter.ai/api/v1/embeddings) or any
// provider that speaks the /v1/embeddings wire format.
//
// Reuses the same LLM_BASE_URL / LLM_API_KEY that the chat LLM already uses.
// Configure the embedding model separately with EMBED_MODEL (defaults to
// openai/text-embedding-3-small, which OpenRouter routes to OpenAI).
//
// Fails soft: both entry points return null/null-array on any error so a
// missing key or provider hiccup never breaks chat.

function clean(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
}

function embedConfig() {
  return {
    baseUrl: (clean(process.env.LLM_BASE_URL) || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    apiKey: clean(process.env.LLM_API_KEY),
    model: clean(process.env.EMBED_MODEL) || 'openai/text-embedding-3-small',
  };
}

type EmbedResponse = {
  data?: { embedding?: number[] }[];
};

async function fetchEmbeddings(input: string | string[]): Promise<(number[] | null)[]> {
  const cfg = embedConfig();
  if (!cfg.apiKey) {
    console.warn('[embedder] LLM_API_KEY not set — memory disabled');
    const len = Array.isArray(input) ? input.length : 1;
    return Array(len).fill(null);
  }

  const res = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      'HTTP-Referer': clean(process.env.PUBLIC_APP_URL),
      'X-Title': 'VirtuaCrush',
    },
    body: JSON.stringify({ model: cfg.model, input }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[embedder] HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as EmbedResponse;
  const items = json?.data ?? [];
  const inputs = Array.isArray(input) ? input : [input];
  return inputs.map((_, i) => {
    const vec = items[i]?.embedding;
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  });
}

/**
 * Embeds a single string into a vector. Returns null on failure so callers
 * degrade gracefully instead of breaking chat.
 */
export async function embed(text: string): Promise<number[] | null> {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  try {
    const [vec] = await fetchEmbeddings(trimmed);
    return vec ?? null;
  } catch (err) {
    console.warn('[embedder] embed failed:', err);
    return null;
  }
}

/**
 * Embeds many strings in one request. Returns an array aligned with the
 * input; entries are null on per-item failure.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const cleaned = texts.map((t) => t?.trim() ?? '');
  if (cleaned.every((t) => !t)) return texts.map(() => null);
  try {
    return await fetchEmbeddings(cleaned);
  } catch (err) {
    console.warn('[embedder] embedBatch failed:', err);
    return texts.map(() => null);
  }
}
