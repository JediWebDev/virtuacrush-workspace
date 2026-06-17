// Image generation + vision via the OpenAI-compatible endpoint (OpenRouter).
//
// Generation uses an image-output model (default FLUX.2 Pro) through the
// /chat/completions endpoint with `modalities:["image"]`; the result comes back
// as a base64 data URL in choices[0].message.images[0].image_url.url, which we
// decode to raw bytes for storage in R2.
//
// runVision() calls a vision-capable model with an image attached, used by the
// publish-time image moderation check.
import { openAiConfig } from './openai';

const IMAGE_MODEL = (process.env.IMAGE_MODEL || 'black-forest-labs/flux.2-pro').trim();
const VISION_MODEL = (process.env.VISION_MODEL || 'openai/gpt-4o-mini').trim();

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': (process.env.PUBLIC_APP_URL || '').trim(),
    'X-Title': 'VirtuaCrush',
  };
}

export interface GeneratedImage {
  body: Buffer;
  contentType: string;
}

/** Pull the first generated image (base64 data URL) out of a chat response. */
function firstImageDataUrl(json: unknown): string | null {
  const msg = (json as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] })
    ?.choices?.[0]?.message;
  const url = msg?.images?.[0]?.image_url?.url;
  return typeof url === 'string' ? url : null;
}

/** Decodes a `data:<mime>;base64,<data>` URL into bytes + content type. */
function decodeDataUrl(dataUrl: string): GeneratedImage | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { contentType: m[1], body: Buffer.from(m[2], 'base64') };
}

/**
 * Generates a square avatar image from a text prompt. Returns the raw bytes
 * (ready to store in R2) or throws on failure.
 */
export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const cfg = openAiConfig();
  if (!cfg.apiKey) throw new Error('[image] LLM_API_KEY is empty');

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(cfg.apiKey),
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image'],
      image_config: { aspect_ratio: '1:1' },
    }),
    signal: AbortSignal.timeout(Math.max(1000, Number(process.env.IMAGE_TIMEOUT_MS ?? 120_000))),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[image] ${IMAGE_MODEL} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const dataUrl = firstImageDataUrl(json);
  if (!dataUrl) throw new Error('[image] no image in response');
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) throw new Error('[image] could not decode image data URL');
  return decoded;
}

/**
 * Runs a vision model over an image (passed as a data URL) with an instruction,
 * returning the model's text reply. Throws on transport failure.
 */
export async function runVision(imageDataUrl: string, instruction: string): Promise<string> {
  const cfg = openAiConfig();
  if (!cfg.apiKey) throw new Error('[image] LLM_API_KEY is empty');

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(cfg.apiKey),
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 200,
    }),
    signal: AbortSignal.timeout(Math.max(1000, Number(process.env.VISION_TIMEOUT_MS ?? 60_000))),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[image] vision ${VISION_MODEL} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json?.choices?.[0]?.message?.content ?? '';
}
