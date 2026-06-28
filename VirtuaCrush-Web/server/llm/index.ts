// Provider selector + the two convenience entry points the app uses everywhere.
// The app speaks the OpenAI-compatible wire format (OpenRouter, OpenAI, etc.).
// The old Inworld vendor provider was removed; LLM_PROVIDER is still accepted for
// backwards-compat but always resolves to the OpenAI-compatible provider.
import { openAiProvider } from './openai';
import type { LlmProvider, CompleteOpts } from './types';
import {
  isPromptLoggingEnabled,
  recordPrompt,
  logPromptToConsole,
} from './prompt_log';

export { isPromptLoggingEnabled, getRecentPrompts, type PromptLogEntry } from './prompt_log';

export type ProviderName = 'openai';

/** The app has a single OpenAI-compatible provider. Kept as a function so the
 *  startup log and tests have a stable entry point. */
export function selectProviderName(_env: NodeJS.ProcessEnv = process.env): ProviderName {
  return 'openai';
}

export function getProvider(): LlmProvider {
  return openAiProvider;
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
  logPrompt('complete', promptForLog(prompt, opts), opts);
  return getProvider().complete(prompt, opts);
}

function promptForLog(prompt: string, opts?: CompleteOpts): string {
  if (opts?.system) {
    return `[system ${opts.system.length} chars]\n${opts.system}\n\n[user ${(opts.user ?? prompt).length} chars]\n${opts.user ?? prompt}`;
  }
  return prompt;
}

export async function* streamPrompt(prompt: string, opts?: CompleteOpts): AsyncGenerator<string> {
  logPrompt('stream', promptForLog(prompt, opts), opts);
  yield* getProvider().stream(prompt, opts);
}

/** Collect a full streamed reply (used by the director path). */
export async function streamCollectPrompt(prompt: string, opts?: CompleteOpts): Promise<string> {
  if (getProvider().streamCollect) return (await getProvider().streamCollect!(prompt, opts)).text;
  let out = '';
  for await (const d of streamPrompt(prompt, opts)) out += d;
  return out;
}
