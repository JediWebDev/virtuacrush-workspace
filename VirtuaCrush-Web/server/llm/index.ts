// Provider selector + the two convenience entry points the app uses everywhere.
import { inworldProvider } from './inworld';
import { openAiProvider } from './openai';
import type { LlmProvider, CompleteOpts } from './types';
import {
  isPromptLoggingEnabled,
  recordPrompt,
  logPromptToConsole,
} from './prompt_log';

export { isPromptLoggingEnabled, getRecentPrompts, type PromptLogEntry } from './prompt_log';

export type ProviderName = 'inworld' | 'openai';

/** Pure: which provider LLM_PROVIDER selects (default 'inworld'). */
export function selectProviderName(env: NodeJS.ProcessEnv = process.env): ProviderName {
  const p = (env.LLM_PROVIDER || 'inworld').toLowerCase();
  return p === 'openai' || p === 'openai-compatible' || p === 'openrouter' ? 'openai' : 'inworld';
}

export function getProvider(): LlmProvider {
  return selectProviderName() === 'openai' ? openAiProvider : inworldProvider;
}

/** When LLM_LOG_PROMPTS is truthy, logs the full prompt (Railway-safe chunks). */
function logPrompt(kind: 'complete' | 'stream', prompt: string, opts?: CompleteOpts): void {
  if (!isPromptLoggingEnabled()) return;
  const entry = {
    kind,
    provider: getProvider().name,
    chars: prompt.length,
    json: Boolean(opts?.json),
    prompt,
  };
  recordPrompt(entry);
  logPromptToConsole({ ...entry, at: new Date().toISOString() });
}

export function completePrompt(prompt: string, opts?: CompleteOpts): Promise<string> {
  logPrompt('complete', prompt, opts);
  return getProvider().complete(prompt, opts);
}
export async function* streamPrompt(prompt: string): AsyncGenerator<string> {
  logPrompt('stream', prompt);
  yield* getProvider().stream(prompt);
}
