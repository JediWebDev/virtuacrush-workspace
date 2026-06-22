// Loads persisted engine state and resolves presentation for API responses.

import { getNpcStates } from './npc_state';
import { readSceneSnapshot } from '../inworld/scene_snapshot';
import { getCharacter } from '../inworld/characters';
import { getUserCharacter } from './user_characters';
import { initEmotions, type EmotionState } from '../sim/emotions';
import { resolvePresentation, type ScenePresentation } from '../sim/scene_presentation';

export async function loadSessionPresentation(
  userId: string,
  characterId: string,
  opts?: { chaosTone?: 'subtle' | 'major' | null; venueChanged?: boolean },
): Promise<ScenePresentation> {
  let companionName = characterId;
  try {
    companionName = getCharacter(characterId).displayName;
  } catch {
    /* custom or unknown */
  }

  let companionPortraitKey: string | null = null;
  if (characterId.startsWith('user:')) {
    const custom = await getUserCharacter(characterId.slice('user:'.length));
    if (custom && custom.ownerUserId === userId) {
      companionPortraitKey = custom.imageKey;
      if (custom.displayName?.trim()) companionName = custom.displayName.trim();
    }
  }

  const npcStateMap = await getNpcStates(userId, [characterId]);
  const knowledge = (npcStateMap[characterId]?.knowledge ?? {}) as Record<string, unknown>;
  const snapshot = readSceneSnapshot(knowledge);
  const storedEmotions = (knowledge.emotions ?? {}) as Partial<EmotionState>;
  const emotions: EmotionState = { ...initEmotions(characterId), ...storedEmotions };

  return resolvePresentation({
    snapshot,
    characterId,
    companionName,
    emotions,
    companionPortraitKey,
    chaosTone: opts?.chaosTone ?? null,
    venueChanged: opts?.venueChanged ?? false,
  });
}
