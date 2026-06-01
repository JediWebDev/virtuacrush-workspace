// Singleton LLM client for the Inworld Runtime SDK.
// One instance is reused across all requests; LLM.create() is expensive.
import { LLM } from '@inworld/runtime/primitives/llm';

let llmPromise: Promise<LLM> | null = null;

export function getLLM(): Promise<LLM> {
  if (!llmPromise) {
    if (!process.env.INWORLD_API_KEY) {
      throw new Error('INWORLD_API_KEY is not set');
    }

    // Model choice trade-off:
    //   - openai/gpt-4o-mini: cheap, fast, great for companion chat (default)
    //   - openai/gpt-4o:      smarter, ~10x cost, use if quality complaints
    //   - openrouter/owl-alpha:     via OpenRouter (see server/lib/openrouter.ts)
    llmPromise = LLM.create({
      remoteConfig: {
        modelId: process.env.INWORLD_MODEL_ID ?? 'openai/gpt-4o-mini',
        apiKey: process.env.INWORLD_API_KEY,
        defaultTimeout: '60s',
        defaultConfig: {
          temperature: 0.85,   // Companions feel flatter below ~0.7
          maxNewTokens: 400,   // Keep replies chatty but bounded
        },
      },
    });
  }
  return llmPromise;
}