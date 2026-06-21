// OpenAI-compatible adapter. Works with OpenAI, OpenRouter, Together, Fireworks,
// DeepInfra, Groq, and self-hosted vLLM/Ollama (incl. RunPod serverless) — any
// endpoint that speaks the /v1/chat/completions format. "OpenAI-compatible" is
// the wire format, not the model maker.
//
// Includes retry-with-backoff + a per-attempt timeout so transient 429/5xx and
// serverless cold-starts (RunPod spinning a worker up) auto-recover instead of
// surfacing as a failed message.
import type { LlmProvider, CompleteOpts, StreamResult } from './types';

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
export function buildChatBody(
  promptOrMessages: string | { role: string; content: string }[],
  cfg: OpenAiCfg,
  json = false,
  overrides?: { model?: string; maxTokens?: number; temperature?: number; stream?: boolean },
) {
  const messages =
    typeof promptOrMessages === 'string'
      ? [{ role: 'user' as const, content: promptOrMessages }]
      : promptOrMessages;
  const model = overrides?.model ?? cfg.model;
  const maxTokens = overrides?.maxTokens ?? cfg.maxTokens;
  const temperature = overrides?.temperature ?? cfg.temperature;
  return {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(overrides?.stream ? { stream: true } : {}),
    ...(cfg.frequencyPenalty ? { frequency_penalty: cfg.frequencyPenalty } : {}),
    ...(cfg.presencePenalty ? { presence_penalty: cfg.presencePenalty } : {}),
    ...(json && process.env.LLM_JSON_MODE !== '0'
      ? { response_format: { type: 'json_object' as const } }
      : {}),
  };
}

function resolveMessages(
  prompt: string,
  opts?: { system?: string; user?: string },
): { role: string; content: string }[] {
  if (opts?.system?.trim()) {
    return [
      { role: 'system', content: opts.system },
      { role: 'user', content: (opts.user ?? prompt).trim() },
    ];
  }
  return [{ role: 'user', content: (opts?.user ?? prompt).trim() }];
}

function cfgWithOpts(cfg: OpenAiCfg, opts?: import('./types').CompleteOpts): OpenAiCfg {
  return {
    ...cfg,
    model: opts?.model?.trim() || cfg.model,
    maxTokens: opts?.maxTokens ?? cfg.maxTokens,
    temperature: opts?.temperature ?? cfg.temperature,
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
  const baseCfg = openAiConfig();
  const cfg = cfgWithOpts(baseCfg, opts);
  if (!loggedConfig) {
    loggedConfig = true;
    const k = baseCfg.apiKey;
    const masked = k ? `${k.slice(0, 8)}…(len ${k.length})` : '(empty)';
    const ref = clean(process.env.LLM_REFEREE_MODEL);
    console.log(
      `[llm] openai-compatible config: baseUrl=${baseCfg.baseUrl} model=${baseCfg.model}` +
        (ref ? ` referee=${ref}` : '') +
        ` key=${masked}`,
    );
  }
  if (!baseCfg.apiKey) {
    throw new Error(
      '[llm] LLM_API_KEY is empty after trimming — set it on your host with no quotes or spaces.',
    );
  }

  const url = `${baseCfg.baseUrl}/chat/completions`;
  const messages = resolveMessages(prompt, opts);
  const body = JSON.stringify(
    buildChatBody(messages, cfg, Boolean(opts?.json), {
      model: cfg.model,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
    }),
  );
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${baseCfg.apiKey}`,
    'HTTP-Referer': clean(process.env.PUBLIC_APP_URL),
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

async function* streamOpenAi(prompt: string, opts?: CompleteOpts): AsyncGenerator<string> {
  const baseCfg = openAiConfig();
  const cfg = cfgWithOpts(baseCfg, opts);
  if (!baseCfg.apiKey) throw new Error('[llm] LLM_API_KEY is empty');

  const url = `${baseCfg.baseUrl}/chat/completions`;
  const messages = resolveMessages(prompt, opts);
  const body = JSON.stringify(
    buildChatBody(messages, cfg, Boolean(opts?.json), {
      model: cfg.model,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
      stream: true,
    }),
  );
  const timeoutMs = Math.max(1000, Number(process.env.LLM_TIMEOUT_MS ?? 120_000));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseCfg.apiKey}`,
        'HTTP-Referer': clean(process.env.PUBLIC_APP_URL),
        'X-Title': 'VirtuaCrush',
      },
      body,
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`[llm] ${cfg.model} stream HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }
  if (!res.body) throw new Error('[llm] stream response has no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: ChatUsage | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
              prompt_tokens_details?: { cached_tokens?: number };
              prompt_cache_hit_tokens?: number;
            };
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
          if (json.usage) usage = parseChatUsage({ usage: json.usage });
        } catch {
          /* ignore malformed SSE chunks */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (usage) recordUsage(usage);
}

async function streamCollectOpenAi(prompt: string, opts?: CompleteOpts): Promise<StreamResult> {
  let text = '';
  for await (const delta of streamOpenAi(prompt, opts)) text += delta;
  return { text, usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 } };
}

export const openAiProvider: LlmProvider = {
  name: 'openai-compatible',
  complete,
  stream: streamOpenAi,
  streamCollect: streamCollectOpenAi,
};
