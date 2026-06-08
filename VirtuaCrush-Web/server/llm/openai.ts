// OpenAI-compatible adapter. Works with OpenAI, OpenRouter, Together, Fireworks,
// DeepInfra, Groq, and self-hosted vLLM/Ollama (incl. RunPod serverless) — any
// endpoint that speaks the /v1/chat/completions format. "OpenAI-compatible" is
// the wire format, not the model maker.
//
// Includes retry-with-backoff + a per-attempt timeout so transient 429/5xx and
// serverless cold-starts (RunPod spinning a worker up) auto-recover instead of
// surfacing as a failed message.
import type { LlmProvider } from './types';

export interface OpenAiCfg {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

// Env values pasted into a host dashboard often arrive with surrounding quotes
// or stray whitespace/newlines. That produces a broken `Bearer` header and an
// opaque 401, so scrub each value before use.
function clean(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
}

// The key specifically: also drop a stray leading "Bearer " if the value was
// pasted with it, which would otherwise double up in the Authorization header.
function cleanKey(v: string | undefined): string {
  return clean(v).replace(/^bearer\s+/i, '').trim();
}

export function openAiConfig(env: NodeJS.ProcessEnv = process.env): OpenAiCfg {
  return {
    baseUrl: (clean(env.LLM_BASE_URL) || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: cleanKey(env.LLM_API_KEY),
    model: clean(env.LLM_MODEL) || 'gpt-4o-mini',
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

// HTTP statuses worth retrying: rate limits, conflicts, and transient gateway/
// cold-start errors common on serverless GPU endpoints.
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with jitter, capped (attempt is 0-based): ~1s, 2s, 4s, 8s. */
function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250);
}

let loggedConfig = false;

async function complete(prompt: string): Promise<string> {
  const cfg = openAiConfig();
  if (!loggedConfig) {
    loggedConfig = true;
    // One-time masked diagnostic: confirms what actually reached the runtime so
    // a wrong/blank key is obvious without ever printing the secret.
    const k = cfg.apiKey;
    const masked = k ? `${k.slice(0, 8)}…(len ${k.length})` : '(empty)';
    console.log(`[llm] openai-compatible config: baseUrl=${cfg.baseUrl} model=${cfg.model} key=${masked}`);
  }
  if (!cfg.apiKey) {
    throw new Error(
      '[llm] LLM_API_KEY is empty after trimming — set it on your host with no quotes or spaces.',
    );
  }

  const url = `${cfg.baseUrl}/chat/completions`;
  const body = JSON.stringify(buildChatBody(prompt, cfg));
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
    'HTTP-Referer': clean(process.env.PUBLIC_APP_URL), // OpenRouter likes these (harmless elsewhere)
    'X-Title': 'VirtuaCrush',
  };
  const maxRetries = Math.max(0, Number(process.env.LLM_MAX_RETRIES ?? 3));
  const timeoutMs = Math.max(1000, Number(process.env.LLM_TIMEOUT_MS ?? 120_000));

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers, body, signal: ac.signal });
    } catch (err) {
      // Network failure / timeout (abort) — transient, retry.
      clearTimeout(timer);
      lastErr = err;
      const reason = (err as Error)?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : (err as Error)?.message;
      if (attempt < maxRetries) {
        const waitMs = backoffMs(attempt);
        console.warn(`[llm] ${cfg.model} request failed (${reason}) [attempt ${attempt + 1}/${maxRetries + 1}] — retrying in ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) return parseChatResponse(await res.json());

    const errBody = await res.text().catch(() => '');
    if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt);
      console.warn(`[llm] ${cfg.model} HTTP ${res.status} [attempt ${attempt + 1}/${maxRetries + 1}] — retrying in ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }
    // Non-retryable (e.g. 401/400) or out of retries — surface it.
    throw new Error(`[llm] ${cfg.model} HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  throw lastErr instanceof Error ? lastErr : new Error('[llm] request failed after retries');
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
