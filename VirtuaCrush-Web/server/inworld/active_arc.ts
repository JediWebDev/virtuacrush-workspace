/** Resolve the currently active story arc for a user/character chat session. */
import { getArcState, clearArc as clearArcState, setArcActive } from '../db/arc_state';
import { getUserStory } from '../db/user_stories';
import { getArc, type SceneAnchor, type StoryArc } from './arcs';
import { userStoryToArc } from './user_arc';
import { hasCompletedMeetArc, meetArcIdFor } from './meet_arc';

export async function resolveActiveStoryArc(
  userId: string,
  characterId: string,
): Promise<{ arc: StoryArc | null; arcId: string | null; startedAt: Date | null }> {
  const state = await getArcState(userId, characterId);
  const arcId = state.currentArcId;
  if (!arcId) return { arc: null, arcId: null, startedAt: null };

  if (arcId.startsWith('user:')) {
    const story = await getUserStory(arcId.slice('user:'.length));
    if (!story || story.ownerUserId !== userId) {
      return { arc: null, arcId, startedAt: state.activeArcStartedAt };
    }
    return {
      arc: userStoryToArc(story),
      arcId,
      startedAt: state.activeArcStartedAt,
    };
  }

  try {
    return { arc: getArc(arcId), arcId, startedAt: state.activeArcStartedAt };
  } catch {
    return { arc: null, arcId, startedAt: state.activeArcStartedAt };
  }
}

/**
 * Arc that should drive greet + free-roam chat. Until the meet-cute completes,
 * clears stale studio/built-in arcs and always returns the meet arc.
 */
export async function resolveMeetFirstStoryArc(
  userId: string,
  characterId: string,
  completedArcIds: Set<string>,
): Promise<{ arc: StoryArc | null; arcId: string | null; startedAt: Date | null }> {
  if (hasCompletedMeetArc(characterId, completedArcIds)) {
    return resolveActiveStoryArc(userId, characterId);
  }

  const meetId = meetArcIdFor(characterId);
  const meetArc = getArc(meetId);
  if (!meetArc) {
    return resolveActiveStoryArc(userId, characterId);
  }

  const state = await getArcState(userId, characterId);
  if (state.currentArcId && state.currentArcId !== meetId) {
    await clearArcState(userId, characterId);
  }
  if (state.currentArcId !== meetId) {
    await setArcActive(userId, characterId, meetId);
    const refreshed = await getArcState(userId, characterId);
    return { arc: meetArc, arcId: meetId, startedAt: refreshed.activeArcStartedAt };
  }

  return { arc: meetArc, arcId: meetId, startedAt: state.activeArcStartedAt };
}

function capitalizeSentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Second-person opening prose for the chat UI — never includes director directives. */
export function composeArcOpeningProse(anchor?: SceneAnchor): string | undefined {
  if (!anchor) return undefined;

  const setting = anchor.setting.trim();
  const situation = anchor.situation.trim();
  const player = anchor.playerSituation?.trim();

  const parts: string[] = [];

  if (setting && situation) {
    const settingPhrase = setting.replace(/^a\s+/i, '').replace(/^an\s+/i, '');
    parts.push(`You find yourself in ${settingPhrase}. ${capitalizeSentence(situation)}`);
  } else if (situation) {
    parts.push(capitalizeSentence(situation));
  } else if (setting) {
    parts.push(`You arrive at ${setting}.`);
  }

  if (player) {
    parts.push(capitalizeSentence(player));
  }

  const prose = parts.join(' ').replace(/\s+/g, ' ').trim();
  return prose || undefined;
}

/** User-facing opening line for an active arc (author intro or composed prose). */
export function arcOpeningLine(arc: StoryArc): string | undefined {
  if (arc.introNarrative?.trim()) return arc.introNarrative.trim();
  return composeArcOpeningProse(arc.sceneAnchor);
}
