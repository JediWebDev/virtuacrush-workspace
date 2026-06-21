// Per-role model selection (director vs referee) and shared CompleteOpts helpers.
import type { CompleteOpts } from './types';
import { openAiConfig } from './openai';

function clean(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
}

/** Fast/cheap model for intent classification (~200 tokens out). */
export function refereeCompleteOpts(): CompleteOpts {
  const cfg = openAiConfig();
  return {
    json: true,
    model: clean(process.env.LLM_REFEREE_MODEL) || cfg.model,
    maxTokens: Math.max(80, Number(process.env.LLM_REFEREE_MAX_TOKENS ?? 220)),
    temperature: Number(process.env.LLM_REFEREE_TEMPERATURE ?? 0.2),
  };
}

/** Main roleplay director (JSON scene output). */
export function directorCompleteOpts(): CompleteOpts {
  const cfg = openAiConfig();
  return {
    json: true,
    model: cfg.model,
    maxTokens: cfg.maxTokens,
    temperature: cfg.temperature,
  };
}
