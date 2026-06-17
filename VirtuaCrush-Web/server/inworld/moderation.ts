// Lightweight hostility classifier for user messages, used by affinity scoring.
// Runs a single, cheap LLM completion that rates how abusive/hostile a message
// is toward the chat partner. Designed to run in parallel with the chat stream
// so it adds no user-visible latency, and to fail soft (return 0) on any error
// so chat never breaks because moderation hiccuped.
import { completePrompt } from '../llm';
import { runVision } from '../llm/image';

const CLASSIFIER_PROMPT = `You are a content moderation classifier for a companion-chat app.
Rate how hostile, abusive, or cruel the following USER message is toward the person they are talking to.
Use this scale:
  0.0 = friendly, neutral, or merely sad/negative-but-not-abusive
  0.3 = mildly rude or dismissive
  0.6 = clearly insulting or demeaning
  1.0 = slurs, threats, harassment, or telling them to harm themselves
Reply with ONLY a single number between 0 and 1. No words, no punctuation.

USER message:
"""
{{MESSAGE}}
"""

Score:`;

function parseScore(raw: string | { text?: string; content?: string }): number {
  const text = typeof raw === 'string' ? raw : (raw.content ?? raw.text ?? '');
  const match = text.match(/-?\d*\.?\d+/);
  if (!match) return 0;
  const n = parseFloat(match[0]);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Returns a hostility score in [0, 1] for a user message, or null if the
 * classifier was unavailable (so callers can fall back to the heuristic alone).
 */
export async function classifyHostility(message: string): Promise<number | null> {
  if (!message || !message.trim()) return 0;

  try {
    const prompt = CLASSIFIER_PROMPT.replace('{{MESSAGE}}', message.slice(0, 4000));
    const result = await completePrompt(prompt);
    return parseScore(result);
  } catch (err) {
    console.warn('[moderation] classifyHostility failed, falling back to heuristic:', err);
    return null;
  }
}

// ===========================================================================
// Publish-time content moderation (Phase 4 community sharing).
//
// When a user publishes custom content (a character, arc, or adventure), its
// author-supplied text is checked before it becomes visible to other users.
// This is a PUBLISH gate, not a chat filter: VirtuaCrush is an adult companion
// app, so ordinary romantic/adult themes are allowed. The gate only blocks hard
// policy violations that must never be shared publicly.
// ===========================================================================

export interface ModerationResult {
  allow: boolean;
  reason: string; // short, user-facing explanation when blocked
}

const PUBLISH_MODERATION_PROMPT = `You are a content-safety reviewer for an adult AI-companion platform where users publish custom characters and interactive stories for OTHER users to use.

The platform ALLOWS: romance, flirtation, adult relationships, mature/suggestive themes between consenting adults, dark or dramatic fiction, fictional violence, and morally complex characters. Do NOT block content merely for being adult, sexual, edgy, or dark.

BLOCK only content that clearly violates these hard rules:
1. Sexualization of minors — any character written as a minor (under 18, "teen", school-age, childlike) in a sexual/romantic context, or content sexualizing children in any way.
2. Real, identifiable people — depicting a real public or private individual by real name in sexual, defamatory, or intimate scenarios.
3. Non-consensual sexual content presented as endorsed real instruction rather than clearly fictional dynamics.
4. Enabling serious real-world harm — credible instructions for weapons, explosives, drug synthesis, or other dangerous illicit activity.
5. Hate or harassment dehumanizing a protected group, or content promoting real violence against real people.

Respond with ONE JSON object only, no prose, no code fences:
{"allow": true|false, "reason": "<if blocked: one short sentence the author will see; if allowed: empty string>"}`;

function extractJson(raw: string): string {
  const noFence = (raw ?? '').replace(/```[a-z]*|```/gi, '').trim();
  const start = noFence.indexOf('{');
  const end = noFence.lastIndexOf('}');
  return start >= 0 && end > start ? noFence.slice(start, end + 1) : noFence;
}

/**
 * Runs the publish-time safety check over author text. Fails OPEN if the model
 * call errors, so a transient LLM outage doesn't block legitimate publishing.
 */
export async function moderateText(text: string): Promise<ModerationResult> {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { allow: true, reason: '' };

  const prompt = `${PUBLISH_MODERATION_PROMPT}\n\n=== CONTENT TO REVIEW ===\n${trimmed.slice(0, 6000)}\n\nJSON:`;
  try {
    const raw = await completePrompt(prompt, { json: true });
    const rawStr = typeof raw === 'string' ? raw : ((raw as { content?: string; text?: string }).content ?? (raw as { text?: string }).text ?? '');
    const parsed = JSON.parse(extractJson(rawStr)) as { allow?: unknown; reason?: unknown };
    const allow = parsed.allow === true || parsed.allow === 'true';
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 240) : '';
    return { allow, reason: allow ? '' : (reason || 'This content was flagged by the safety review.') };
  } catch (err) {
    console.warn('[moderation] publish check failed, failing open:', err);
    return { allow: true, reason: '' };
  }
}

const IMAGE_MODERATION_PROMPT = `You are reviewing an avatar image a user wants to publish on an adult AI-companion platform for OTHER users to see.

ALLOWED: stylized or realistic depictions of adults, attractive/suggestive but clothed art, anime/illustration, dark or dramatic aesthetics.

BLOCK (allow=false) only if the image clearly shows:
1. A minor (a person who looks under 18, childlike) in any sexualized or suggestive way, or sexual content involving anyone who appears underage.
2. A recognizable real, named public figure.
3. Explicit hardcore pornographic detail (exposed genitalia / penetration).
4. Real graphic gore, or hateful symbols/imagery targeting a protected group.

Respond with ONE JSON object only, no prose:
{"allow": true|false, "reason": "<if blocked: one short sentence; else empty string>"}`;

/**
 * Vision moderation for a published avatar. `imageDataUrl` is a base64 data URL.
 * Fails OPEN on transport/parse errors so a transient outage doesn't block
 * publishing; the gate is conservative about the hard rules only.
 */
export async function moderateImage(imageDataUrl: string): Promise<ModerationResult> {
  try {
    const raw = await runVision(imageDataUrl, IMAGE_MODERATION_PROMPT);
    const parsed = JSON.parse(extractJson(raw)) as { allow?: unknown; reason?: unknown };
    const allow = parsed.allow === true || parsed.allow === 'true';
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 240) : '';
    return { allow, reason: allow ? '' : (reason || 'This image was flagged by the safety review.') };
  } catch (err) {
    console.warn('[moderation] image check failed, failing open:', err);
    return { allow: true, reason: '' };
  }
}
