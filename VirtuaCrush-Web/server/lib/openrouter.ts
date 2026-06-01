// OpenRouter OpenAI-compatible chat completions client.
// migrated to OpenRouter — all LLM transport for Owl Alpha goes through here.

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_MODEL = 'openrouter/owl-alpha';

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface ChatCompletionParams {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

function openRouterHeaders(): Record<string, string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const referer = process.env.PUBLIC_APP_URL;
  if (referer) {
    headers['HTTP-Referer'] = referer;
  }
  headers['X-Title'] = 'VirtuaCrush';

  return headers;
}

/**
 * Non-streaming chat completion. Returns assistant text from choices[0].message.content.
 */
export async function createChatCompletion(params: ChatCompletionParams): Promise<string> {
  const messages: OpenRouterMessage[] = [];
  if (params.system) {
    messages.push({ role: 'system', content: params.system });
  }
  messages.push(...params.messages);

  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: params.max_tokens ?? 256,
      messages,
    }),
  });

  const body = (await res.json()) as ChatCompletionResponse;

  if (!res.ok) {
    const msg = body.error?.message ?? JSON.stringify(body);
    throw new Error(`OpenRouter API error ${res.status}: ${msg}`);
  }

  const content = body.choices?.[0]?.message?.content;
  if (content == null) {
    throw new Error('OpenRouter response missing choices[0].message.content');
  }

  return content;
}
