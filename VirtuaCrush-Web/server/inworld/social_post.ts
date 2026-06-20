// Autonomous, context-aware social posts.
//
// After a meaningful chat beat (first-meeting completed, plans/contact swapped,
// an affinity milestone, or a real emotional disclosure), the character may
// post to their social feed in-character — as if the sim world keeps living
// when the player looks away. The chat route detects the trigger; this module
// owns the cooldown, generation, persistence, and memory write. Everything
// fails soft: a hiccup here must never break the chat reply.
import { completePrompt } from '../llm';
import { getCharacter } from './characters';
import { createPost, lastPostAt } from '../db/posts';
import { hasPostTrigger, recordPostTrigger } from '../db/post_triggers';
import { storeSignificantEvent } from '../db/memory';

// At most one autonomous post per character per ~day, so feeds never spam.
const COOLDOWN_MS = 20 * 60 * 60 * 1000;

export interface PostTrigger {
  key: string;
  reason: string;
}

function cleanPost(s: string): string {
  return (s ?? '')
    .replace(/```[a-z]*|```/gi, '')
    .replace(/^\s*(post|status|tweet)\s*:\s*/i, '')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim()
    .slice(0, 280);
}

async function generatePostText(
  characterId: string,
  reason: string,
): Promise<string> {
  let character;
  try { character = getCharacter(characterId as Parameters<typeof getCharacter>[0]); }
  catch { return ''; }

  const prompt =
    `${character.systemPrompt}\n\n` +
    `=== SOCIAL POST ===\n` +
    `Something just happened in your day: ${reason}.\n` +
    `Write a SHORT social-media post about it, in your own distinct voice and personality — first person, ` +
    `casual, like a quick status update. Max 200 characters. Do NOT name, tag, or @ the person involved ` +
    `(keep them vague — "someone", "a stranger", etc.). Do NOT wrap the post in quotation marks. An emoji is ` +
    `fine only if it fits you. Output ONLY the post text, nothing else.`;

  try {
    return cleanPost(await completePrompt(prompt));
  } catch (e) {
    console.warn('[social_post] generation failed:', e);
    return '';
  }
}

/**
 * Generates + stores an in-character social post if the cooldown allows and
 * this trigger has not fired before for this user/character pair.
 */
export async function maybeAutonomousPost(p: {
  userId: string;
  characterId: string;
  displayName: string;
  trigger: PostTrigger;
}): Promise<string | null> {
  try {
    if (await hasPostTrigger(p.userId, p.characterId, p.trigger.key)) return null;

    const last = await lastPostAt(p.userId, p.characterId);
    if (last && Date.now() - last.getTime() < COOLDOWN_MS) return null;

    const text = await generatePostText(p.characterId, p.trigger.reason);
    if (!text) return null;

    await createPost(p.userId, p.characterId, text);
    await recordPostTrigger(p.userId, p.characterId, p.trigger.key);
    await storeSignificantEvent(p.userId, p.characterId, `${p.displayName} posted publicly: "${text}"`);
    console.log(`[social_post] ${p.characterId} auto-posted trigger=${p.trigger.key} user=${p.userId}`);
    return text;
  } catch (e) {
    console.warn('[social_post] maybeAutonomousPost failed:', e);
    return null;
  }
}

const AFFINITY_MILESTONES = [35, 55, 80] as const;

/**
 * Explicit contact handoff in this turn — not casual "see you later" or generic
 * hang-out talk that can repeat every session.
 */
export function detectFirstContactExchange(turnText: string): boolean {
  const t = turnText.toLowerCase();
  if (
    /\b(swap(ped|ping)?|exchange(d|s|ing)?|share(d|s|ing)?|trade(d|s|ing)?|give(n|s|ing)?|got|here'?s?)\s+(numbers?|digits?|phones?|contacts?)\b/.test(t)
    || /\b(numbers?|digits?|phones?|contacts?)\s+(swap(ped|ping)?|exchange(d|s|ing)?|share(d|s|ing)?|trade(d|s|ing)?)\b/.test(t)
    || /\b(my|your)\s+(cell|number|digits|phone|contact)\b/.test(t)
    || /\bhere('s| is)\s+(my|the)\s+(cell|number|digits|phone|contact)\b/.test(t)
    || /\b(text|message|call|dm)\s+me\b/.test(t)
    || /\bhit\s+me\s+up\b/.test(t)
    || /\b(add|save)\s+(me|my\s+(number|contact))\b/.test(t)
    || /\b\d[\d\s\-().]{7,}\d\b/.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Picks the most specific post-worthy trigger for this turn, or null. Pure so the
 * chat route stays readable and this is unit-testable.
 */
export function postTriggerForTurn(p: {
  completedArcId?: string | null;
  arcBadgeTitle?: string | null;
  turnText: string;
  prevAffinity: number;
  newAffinity: number;
  emotionalDisclosure: boolean;
}): PostTrigger | null {
  if (p.completedArcId && p.arcBadgeTitle) {
    return {
      key: `arc:${p.completedArcId}`,
      reason: `you just shared a memorable moment with someone you met (${p.arcBadgeTitle})`,
    };
  }
  if (detectFirstContactExchange(p.turnText)) {
    return {
      key: 'contact_swap',
      reason: 'you swapped numbers or traded contact info with someone new',
    };
  }
  const crossed = AFFINITY_MILESTONES.find((m) => p.prevAffinity < m && p.newAffinity >= m);
  if (crossed) {
    return {
      key: `affinity:${crossed}`,
      reason: `you're getting noticeably closer to someone you've been spending time with`,
    };
  }
  if (p.emotionalDisclosure) {
    return {
      key: 'emotional_disclosure',
      reason: 'you opened up to someone about something you usually keep private',
    };
  }
  return null;
}

/** @deprecated Use postTriggerForTurn — kept for tests migrating gradually. */
export function postReasonForTurn(p: Parameters<typeof postTriggerForTurn>[0]): string | null {
  return postTriggerForTurn(p)?.reason ?? null;
}
