/** Resolve the currently active story arc for a user/character chat session. */
import { getArcState } from '../db/arc_state';
import { getUserStory } from '../db/user_stories';
import { getArc, type StoryArc } from './arcs';
import { userStoryToArc } from './user_arc';

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

/** User-facing opening line for an active arc (intro or setting fallback). */
export function arcOpeningLine(arc: StoryArc): string | undefined {
  if (arc.introNarrative?.trim()) return arc.introNarrative.trim();
  const anchor = arc.sceneAnchor;
  if (!anchor) return undefined;
  const setting = anchor.setting?.trim();
  const situation = anchor.situation?.trim();
  if (setting && situation) return `${setting.charAt(0).toUpperCase()}${setting.slice(1)}. ${situation}`;
  return situation || setting;
}
