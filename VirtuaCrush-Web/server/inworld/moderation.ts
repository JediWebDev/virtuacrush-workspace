// Lightweight hostility classifier for user messages, used by affinity scoring.
// Runs a single, cheap LLM completion that rates how abusive/hostile a message
// is toward the chat partner. Designed to run in parallel with the chat stream
// so it adds no user-visible latency, and to fail soft (return 0) on any error
// so chat never breaks because moderation hiccuped.
import { completePrompt } from '../llm';

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
