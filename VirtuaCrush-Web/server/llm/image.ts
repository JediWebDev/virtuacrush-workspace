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

const IMAGE_MODEL = (process.env.IMAGE_MODEL || 'black-forest-labs/flux.2-max').trim();
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

/** Pull the first generated image URL (base64 data URL OR hosted http URL) out
 *  of a chat response. Tolerates a couple of response shapes providers use. */
function firstImageUrl(json: unknown): string | null {
  const msg = (json as {
    choices?: { message?: {
      images?: ({ image_url?: { url?: string } } | { url?: string })[];
      content?: unknown;
    } }[];
  })?.choices?.[0]?.message;
  const img = msg?.images?.[0] as { image_url?: { url?: string }; url?: string } | undefined;
  const url = img?.image_url?.url ?? img?.url;
  return typeof url === 'string' && url ? url : null;
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
    throw new Error(`[image] ${IMAGE_MODEL} HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  const json = await res.json();
  const url = firstImageUrl(json);
  if (!url) {
    // Surface what actually came back so the cause is visible in logs.
    throw new Error(`[image] ${IMAGE_MODEL} returned no image. Response: ${JSON.stringify(json).slice(0, 500)}`);
  }

  // Base64 data URL → decode directly.
  if (url.startsWith('data:')) {
    const decoded = decodeDataUrl(url);
    if (!decoded) throw new Error('[image] could not decode image data URL');
    return decoded;
  }

  // Hosted URL → fetch the bytes.
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!imgRes.ok) throw new Error(`[image] fetching generated image failed: HTTP ${imgRes.status}`);
  const contentType = imgRes.headers.get('content-type') || 'image/png';
  const body = Buffer.from(await imgRes.arrayBuffer());
  return { body, contentType };
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
