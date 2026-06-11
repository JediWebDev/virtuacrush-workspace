// OpenAI-compatible adapter. Works with OpenAI, OpenRouter, Together, Fireworks,
// DeepInfra, Groq, and self-hosted vLLM/Ollama (incl. RunPod serverless) — any
// endpoint that speaks the /v1/chat/completions format. "OpenAI-compatible" is
// the wire format, not the model maker.
//
// Includes retry-with-backoff + a per-attempt timeout so transient 429/5xx and
// serverless cold-starts (RunPod spinning a worker up) auto-recover instead of
// surfacing as a failed message.
import type { LlmProvider, CompleteOpts } from './types';

export interface OpenAiCfg {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** Discourages verbatim self-repetition (roleplay models loop without it). */
  frequencyPenalty: number;
  presencePenalty: number;
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
    // The director reply is one JSON object: intent + ALL dialogue lines
    // (companion, narrator, side characters). 400 routinely truncated the JSON
    // mid-string once scenes gained a second speaker -> unparseable -> fallback.
    maxTokens: Number(env.LLM_MAX_TOKENS ?? 700),
    // OPT-IN: several free/quantized providers degenerate into token salad
    // when penalties are applied — leave at 0 unless your model handles them
    // (e.g. DeepSeek/OpenAI-hosted models take 0.2-0.4 fine).
    frequencyPenalty: Number(env.LLM_FREQUENCY_PENALTY ?? 0),
    presencePenalty: Number(env.LLM_PRESENCE_PENALTY ?? 0),
  };
}

/** Pure: the chat-completions request body. */
export function buildChatBody(prompt: string, cfg: OpenAiCfg, json = false) {
  return {
    model: cfg.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    // Only sent when explicitly configured — some providers mishandle them.
    ...(cfg.frequencyPenalty ? { frequency_penalty: cfg.frequencyPenalty } : {}),
    ...(cfg.presencePenalty ? { presence_penalty: cfg.presencePenalty } : {}),
    // JSON mode (OpenAI/DeepSeek-compatible): constrains output to one valid
    // JSON object. Used by callers that pass { json: true }.
    ...(json ? { response_format: { type: 'json_object' as const } } : {}),
  };
}

/** Pure: pull the assistant text out of a chat-completions response. */
export function parseChatResponse(json: unknown): string {
  const j = json as { choices?: { message?: { content?: string } }[] };
  return j?.choices?.[0]?.message?.content ?? '';
}

// --- Token metering -----------------------------------------------------------
// Every response carries usage counts; we accumulate them per UTC day so the
// server log answers "what does a message cost?" without external tooling.
// Set LLM_PRICE_IN / LLM_PRICE_OUT ($ per million tokens) to get a running $.

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  /** Provider-reported cached prompt tokens (discounted), when available. */
  cachedTokens: number;
}

/** Pure: pull usage counts out of a chat-completions response. */
export function parseChatUsage(json: unknown): ChatUsage {
  const u = (json as {
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
      prompt_cache_hit_tokens?: number; // DeepSeek-style field
    };
  })?.usage;
  return {
    promptTokens: u?.prompt_tokens ?? 0,
    completionTokens: u?.completion_tokens ?? 0,
    cachedTokens: u?.prompt_tokens_details?.cached_tokens ?? u?.prompt_cache_hit_tokens ?? 0,
  };
}

const meter = { day: '', calls: 0, prompt: 0, completion: 0, cached: 0 };

function recordUsage(u: ChatUsage): void {
  const today = new Date().toISOString().slice(0, 10);
  if (meter.day !== today) {
    meter.day = today;
    meter.calls = 0;
    meter.prompt = 0;
    meter.completion = 0;
    meter.cached = 0;
  }
  meter.calls++;
  meter.prompt += u.promptTokens;
  meter.completion += u.completionTokens;
  meter.cached += u.cachedTokens;

  const priceIn = Number(process.env.LLM_PRICE_IN ?? 0);   // $ per 1M input tokens
  const priceOut = Number(process.env.LLM_PRICE_OUT ?? 0); // $ per 1M output tokens
  const cost =
    priceIn || priceOut
      ? ` ≈$${(((meter.prompt - meter.cached) * priceIn + meter.completion * priceOut) / 1e6).toFixed(4)} today`
      : '';
  console.log(
    `[llm] usage in=${u.promptTokens} (cached ${u.cachedTokens}) out=${u.completionTokens} | ` +
      `today: ${meter.calls} calls, in=${meter.prompt}, out=${meter.completion}${cost}`,
  );
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

async function complete(prompt: string, opts?: CompleteOpts): Promise<string> {
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
  const body = JSON.stringify(buildChatBody(prompt, cfg, Boolean(opts?.json)));
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

    if (res.ok) {
      // Some providers occasionally return malformed JSON bodies (seen on
      // Featherless): treat as transient and retry instead of crashing.
      const bodyText = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(bodyText);
      } catch {
        lastErr = new Error(`[llm] ${cfg.model} returned a malformed JSON body`);
        if (attempt < maxRetries) {
          const waitMs = backoffMs(attempt);
          console.warn(`[llm] ${cfg.model} malformed JSON body [attempt ${attempt + 1}/${maxRetries + 1}] — retrying in ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }
        throw lastErr;
      }
      recordUsage(parseChatUsage(json));
      return parseChatResponse(json);
    }

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
  async *stream(prompt: string) {
    // Non-streaming for simplicity/robustness: yield the full reply at once. The
    // director path uses complete() anyway; the jail narrator just appears whole.
    const text = await complete(prompt);
    if (text) yield text;
  },
};
