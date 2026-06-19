// Meet-cute arc helpers — first-encounter gating, three-act phases, completion rewards.
import type { ArcPhaseInstructions, StoryArc } from './arcs';
import { getArc } from './arcs';

/** Affinity granted when the player completes a character's meet-cute arc. */
export const MEET_AFFINITY_REWARD = 8;

export function meetArcIdFor(characterId: string): string {
  return `${characterId}_meet`;
}

/** True when this roster character has a built-in meet arc and the player finished it. */
export function hasCompletedMeetArc(characterId: string, completedArcIds: Set<string>): boolean {
  const meetId = meetArcIdFor(characterId);
  if (!getArc(meetId)) return true;
  return completedArcIds.has(meetId);
}

/** Standard three-act phase blocks for meet-cute arcs (matches Studio arc structure). */
export function meetPhaseInstructions(parts: {
  beginning: string;
  middle: string;
  end: string;
}): ArcPhaseInstructions {
  return {
    beginning: `MEET — BEGINNING (setup): ${parts.beginning}`,
    middle: `MEET — MIDDLE (connection): ${parts.middle}`,
    end: `MEET — RESOLUTION (payoff): ${parts.end}`,
  };
}

/** Authored default badges when the director omits earnedBadge on meet completion. */
const MEET_BADGES: Record<string, { title: string; description: string }> = {
  serena: { title: 'Paint-Splattered Hello', description: 'You survived Serena\'s art-store catastrophe and actually connected.' },
  becca: { title: 'Same Shelf, Same Taste', description: 'You and Becca reached for the same film — and meant it.' },
  mina: { title: 'Artist Alley Collision', description: 'You met Mina mid-speedrun and earned a real moment together.' },
  madison: { title: 'Shared Cup of Fate', description: 'Madison decided it was fate — and you gave her something real back.' },
  jordan: { title: 'Fifth Player Found', description: 'Jordan pulled you into the game — and you held your own.' },
  riot: { title: 'After the Encore', description: 'A guitar case, a near miss, and a conversation worth staying for.' },
  lexi: { title: 'Wrong Car, Right Person', description: 'You handled Lexi\'s parking-garage moment better than she expected.' },
  lin: { title: 'Caught in the Stacks', description: 'You caught Lin\'s books — and he actually wanted to know you.' },
  iris: { title: 'Quiet in the Garden', description: 'Iris offered calm; you offered something honest in return.' },
  ash: { title: 'Layover Connection', description: 'Ash helped you find your way — and you found each other.' },
};

export function defaultMeetBadge(arc: StoryArc): { title: string; description: string } {
  return (
    MEET_BADGES[arc.characterId] ?? {
      title: 'First Meeting',
      description: 'You shared a genuine first encounter.',
    }
  );
}

export function resolveMeetCompletionBadge(
  arc: StoryArc,
  fromDirector: { title: string; description: string } | null,
): { title: string; description: string } {
  if (fromDirector?.title && fromDirector?.description) return fromDirector;
  return defaultMeetBadge(arc);
}

export interface MeetCompletionInput {
  /** User messages since this arc started (including the current turn). */
  userTurnsSinceStart: number;
  playerDisplayName: string;
  companionName: string;
  /** Recent transcript tail (user + assistant), newest last. */
  recentText: string;
  /** The player's message this turn. */
  currentUserMessage: string;
}

const CONNECTION_PATTERNS = [
  /\b(phone|number|text me|text you|dm me|instagram|snap(chat)?)\b/i,
  /\b(hang out|see you|catch a movie|grab (coffee|drinks)|next time)\b/i,
  /\b(my contacts?|here'?s my|call me)\b/i,
  /\b(i'?ll text|i will text|in my phone)\b/i,
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textMentionsName(text: string, name: string): boolean {
  const n = name.trim();
  if (!n || n.length < 2) return false;
  return new RegExp(`\\b${escapeRegExp(n)}\\b`, 'i').test(text);
}

/** True when the meet-cute has clearly landed (names + connection) — server may force completion. */
export function meetArcReadyToComplete(input: MeetCompletionInput): boolean {
  if (input.userTurnsSinceStart < 3) return false;

  const blob = `${input.recentText}\n${input.currentUserMessage}`;
  const playerNamed =
    textMentionsName(blob, input.playerDisplayName) ||
    /\b(i'?m|my name is|call me)\s+[A-Z][a-z]+/i.test(blob);
  const companionNamed = textMentionsName(blob, input.companionName);
  const connectionBeat = CONNECTION_PATTERNS.some((re) => re.test(blob));

  return playerNamed && companionNamed && connectionBeat;
}

export function formatMeetArcPacingBlock(): string {
  return (
    `\nMEET-CUTE PACING (first meeting only — keep it SHORT):\n` +
    `- Target 4–8 player turns total, not a full date. Escalate connection, then LAND the meet.\n` +
    `- When completion criteria are satisfied — names exchanged AND a real connection beat (film talk, phone swap, plans to hang out, etc.) — you MUST set arcStatus "completed" on THIS turn with earnedBadge. Do not keep bantering once the meet has clearly landed.\n` +
    `- After arcStatus "completed", leave "choices" empty []. Do not suggest more moves.\n` +
    `- NEVER re-open the scene with a fresh intro or reset to the collision — follow the conversation history forward only.`
  );
}
