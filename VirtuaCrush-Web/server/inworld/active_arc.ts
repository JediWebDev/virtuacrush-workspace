/** Resolve the currently active story arc for a user/character chat session. */
import { getArcState } from '../db/arc_state';
import { getUserStory } from '../db/user_stories';
import { getArc, type SceneAnchor, type StoryArc } from './arcs';
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
