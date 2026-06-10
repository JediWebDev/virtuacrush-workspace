// Provider selector + the two convenience entry points the app uses everywhere.
import { inworldProvider } from './inworld';
import { openAiProvider } from './openai';
import type { LlmProvider, CompleteOpts } from './types';

export type ProviderName = 'inworld' | 'openai';

/** Pure: which provider LLM_PROVIDER selects (default 'inworld'). */
export function selectProviderName(env: NodeJS.ProcessEnv = process.env): ProviderName {
  const p = (env.LLM_PROVIDER || 'inworld').toLowerCase();
  return p === 'openai' || p === 'openai-compatible' || p === 'openrouter' ? 'openai' : 'inworld';
}

export function getProvider(): LlmProvider {
  return selectProviderName() === 'openai' ? openAiProvider : inworldProvider;
}

export function completePrompt(prompt: string, opts?: CompleteOpts): Promise<string> {
  return getProvider().complete(prompt, opts);
}
export function streamPrompt(prompt: string): AsyncGenerator<string> {
  return getProvider().stream(prompt);
}
