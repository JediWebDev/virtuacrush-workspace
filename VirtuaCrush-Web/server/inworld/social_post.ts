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
import { storeSignificantEvent } from '../db/memory';

// At most one autonomous post per character per ~day, so feeds never spam.
const COOLDOWN_MS = 20 * 60 * 60 * 1000;

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
 * Generates + stores an in-character social post if the cooldown allows.
 * Returns the post text on success, or null if skipped/failed. Safe to await
 * from the chat route only when a trigger actually fired (keeps latency off the
 * common path).
 */
export async function maybeAutonomousPost(p: {
  userId: string;
  characterId: string;
  displayName: string;
  reason: string;
}): Promise<string | null> {
  try {
    const last = await lastPostAt(p.userId, p.characterId);
    if (last && Date.now() - last.getTime() < COOLDOWN_MS) return null;

    const text = await generatePostText(p.characterId, p.reason);
    if (!text) return null;

    await createPost(p.userId, p.characterId, text);
    // Remember it so the character has continuity ("I posted about meeting them").
    await storeSignificantEvent(p.userId, p.characterId, `${p.displayName} posted publicly: "${text}"`);
    console.log(`[social_post] ${p.characterId} auto-posted for user=${p.userId}`);
    return text;
  } catch (e) {
    console.warn('[social_post] maybeAutonomousPost failed:', e);
    return null;
  }
}

const AFFINITY_MILESTONES = [35, 55, 80] as const;
const CONTACT_OR_PLANS =
  /\b(number|digits|phone)\b|\btext me\b|\bhit me up\b|\bcall me\b|\bsee you (again|around|soon|next|later)\b|\bnext time\b|\bhang ?out\b|\bget together\b|\bmeet ?up\b|\bagain sometime\b|\bcome over\b|\byour place\b/i;

/**
 * Picks the most specific post-worthy reason for this turn, or null. Pure so the
 * chat route stays readable and this is unit-testable.
 */
export function postReasonForTurn(p: {
  arcBadgeTitle?: string | null;       // set when an arc (incl. the meet) just completed
  turnText: string;                    // user message + assistant reply, for keyword detection
  prevAffinity: number;
  newAffinity: number;
  emotionalDisclosure: boolean;        // e.g. a secret was revealed this turn
}): string | null {
  if (p.arcBadgeTitle) {
    return `you just shared a memorable moment with someone you met (${p.arcBadgeTitle})`;
  }
  if (CONTACT_OR_PLANS.test(p.turnText)) {
    return `you swapped numbers / made plans to see someone again`;
  }
  const crossed = AFFINITY_MILESTONES.find((m) => p.prevAffinity < m && p.newAffinity >= m);
  if (crossed) {
    return `you're getting noticeably closer to someone you've been spending time with`;
  }
  if (p.emotionalDisclosure) {
    return `you opened up to someone about something you usually keep private`;
  }
  return null;
}
