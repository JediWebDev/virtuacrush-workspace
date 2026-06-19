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
