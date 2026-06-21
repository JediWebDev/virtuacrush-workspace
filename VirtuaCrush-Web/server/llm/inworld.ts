// Inworld Runtime adapter (default). Wraps the native LLM primitive.
//
// The '@inworld/runtime' native addon is loaded LAZILY (dynamic import inside
// the methods) so that an OpenAI/OpenRouter-only deploy never touches the
// native binary at startup — and could even drop the dependency entirely.
import type { LlmProvider, CompleteOpts } from './types';

function extractText(chunk: unknown): string | undefined {
  if (!chunk || typeof chunk !== 'object') return undefined;
  const r = chunk as Record<string, unknown>;
  const t = r.content ?? r.text;
  return typeof t === 'string' && t.length > 0 ? t : undefined;
}

type LowLevel = {
  generateContentStream?: (o: { prompt: string }) => AsyncIterable<unknown>;
  generateContent?: (o: { prompt: string }) => Promise<AsyncIterable<unknown>>;
  generateContentComplete: (o: { prompt: string }) => Promise<string | { text?: string; content?: string }>;
};

async function lowLevel(): Promise<{ llm: LowLevel; modelId: string }> {
  const client = await import('../inworld/client');
  const llm = (await client.getLLM()) as unknown as LowLevel;
  return { llm, modelId: client.activeModelId() };
}

export const inworldProvider: LlmProvider = {
  name: 'inworld',
  async complete(prompt, _opts?: CompleteOpts) {
    const { llm, modelId } = await lowLevel();
    try {
      const r = await llm.generateContentComplete({ prompt });
      return typeof r === 'string' ? r : (r?.content ?? r?.text ?? '');
    } catch (err) {
      console.error(`[llm] inworld completion failed (model=${modelId}):`, (err as Error)?.message ?? err);
      throw err;
    }
  },
  async *stream(prompt, _opts?: CompleteOpts) {
    const { llm } = await lowLevel();
    if (typeof llm.generateContentStream === 'function') {
      for await (const raw of llm.generateContentStream({ prompt })) { const t = extractText(raw); if (t) yield t; }
      return;
    }
    if (typeof llm.generateContent === 'function') {
      const s = await llm.generateContent({ prompt });
      for await (const raw of s) { const t = extractText(raw); if (t) yield t; }
      return;
    }
    const r = await llm.generateContentComplete({ prompt });
    const t = typeof r === 'string' ? r : (r?.content ?? r?.text ?? '');
    if (t) yield t;
  },
};
