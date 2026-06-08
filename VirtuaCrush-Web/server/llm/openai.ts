// OpenAI-compatible adapter. Works with OpenAI, OpenRouter, Together, Fireworks,
// DeepInfra, Groq, and self-hosted vLLM/Ollama — anything that speaks the
// /v1/chat/completions format. The MODEL can be any of theirs (Llama, Mistral,
// Qwen, uncensored fine-tunes, Claude/Gemini via OpenRouter); "OpenAI-compatible"
// is the wire format, not the model maker.
import type { LlmProvider } from './types';

export interface OpenAiCfg {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export function openAiConfig(env: NodeJS.ProcessEnv = process.env): OpenAiCfg {
  return {
    baseUrl: (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY || '',
    model: env.LLM_MODEL || 'gpt-4o-mini',
    temperature: Number(env.LLM_TEMPERATURE ?? 0.85),
    maxTokens: Number(env.LLM_MAX_TOKENS ?? 400),
  };
}

/** Pure: the chat-completions request body. */
export function buildChatBody(prompt: string, cfg: OpenAiCfg) {
  return {
    model: cfg.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
  };
}

/** Pure: pull the assistant text out of a chat-completions response. */
export function parseChatResponse(json: unknown): string {
  const j = json as { choices?: { message?: { content?: string } }[] };
  return j?.choices?.[0]?.message?.content ?? '';
}

async function complete(prompt: string): Promise<string> {
  const cfg = openAiConfig();
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      // OpenRouter likes these (harmless elsewhere):
      'HTTP-Referer': process.env.PUBLIC_APP_URL || '',
      'X-Title': 'VirtuaCrush',
    },
    body: JSON.stringify(buildChatBody(prompt, cfg)),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[llm] ${cfg.model} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return parseChatResponse(await res.json());
}

export const openAiProvider: LlmProvider = {
  name: 'openai-compatible',
  complete,
  async *stream(prompt) {
    // Non-streaming for simplicity/robustness: yield the full reply at once. The
    // director path uses complete() anyway; the jail narrator just appears whole.
    const text = await complete(prompt);
    if (text) yield text;
  },
};
