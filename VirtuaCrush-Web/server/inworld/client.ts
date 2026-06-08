// Singleton LLM client for the Inworld Runtime SDK.
// One instance is reused across all requests; LLM.create() is expensive.
//
// SWITCHING MODELS: set INWORLD_MODEL_ID in .env, then RESTART the API
// (`dev:api`). The instance caches the model at startup, and a .env change does
// NOT trigger `tsx watch` to reload, so a restart is required.
import { LLM } from '@inworld/runtime/primitives/llm';

let llmPromise: Promise<LLM> | null = null;

/** The active model id (env-configurable). Examples:
 *   - openai/gpt-4o-mini : cheap, fast (default)
 *   - openai/gpt-4o      : smarter, ~10x cost — the safe "stronger" upgrade
 *  Confirm the exact slug in Inworld's supported-model list before switching. */
export function activeModelId(): string {
  return process.env.INWORLD_MODEL_ID?.trim() || 'openai/gpt-4o-mini';
}

export function getLLM(): Promise<LLM> {
  if (!llmPromise) {
    if (!process.env.INWORLD_API_KEY) {
      throw new Error('INWORLD_API_KEY is not set');
    }
    const modelId = activeModelId();
    console.log(`[llm] initializing Inworld model: ${modelId}`);

    llmPromise = LLM.create({
      remoteConfig: {
        modelId,
        apiKey: process.env.INWORLD_API_KEY,
        defaultTimeout: '60s',
        defaultConfig: {
          temperature: 0.85, // Companions feel flatter below ~0.7
          maxNewTokens: 400, // Keep replies chatty but bounded
        },
      },
    }).catch((err: unknown) => {
      // A bad model id / transient init error must NOT poison the singleton
      // forever. Clear the cache so the next request retries, and make the cause
      // obvious instead of an empty reply.
      console.error(
        `[llm] FAILED to initialize model "${modelId}" — check the id is valid for your Inworld key/plan. Cause:`,
        (err as Error)?.message ?? err,
      );
      llmPromise = null;
      throw err;
    });
  }
  return llmPromise;
}
