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

/** When LLM_LOG_PROMPTS=1, prints the full prompt sent to the model (dev/debug). */
function logPrompt(kind: 'complete' | 'stream', prompt: string, opts?: CompleteOpts): void {
  if (process.env.LLM_LOG_PROMPTS !== '1') return;
  const provider = getProvider().name;
  const sep = '─'.repeat(72);
  const jsonNote = opts?.json ? ' json=true' : '';
  console.log(
    `\n[llm:prompt] ${kind} provider=${provider} chars=${prompt.length}${jsonNote}\n${sep}\n${prompt}\n${sep}\n`,
  );
}

export function completePrompt(prompt: string, opts?: CompleteOpts): Promise<string> {
  logPrompt('complete', prompt, opts);
  return getProvider().complete(prompt, opts);
}
export async function* streamPrompt(prompt: string): AsyncGenerator<string> {
  logPrompt('stream', prompt);
  yield* getProvider().stream(prompt);
}
