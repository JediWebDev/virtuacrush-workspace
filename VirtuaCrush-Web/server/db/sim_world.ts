// Assembles a live WorldState for (user, companion) by fetching the player
// profile, scene, affinity, and per-user npc_state, then composing them with the
// roster seed (pure composeWorld). Thin DB wrapper.
import { getFullProfile } from './profile';
import { getSituation } from './state';
import { getAffinity } from './affinity';
import { getNpcStates } from './npc_state';
import { scenePhase } from './scene_util';
import { getCharacter } from '../inworld/characters';
import { composeWorld } from '../sim/compose';
import type { WorldState } from '../sim/world';

export async function assembleWorld(userId: string, companionId: string): Promise<WorldState> {
  const [full, situation, affinity, npcStates] = await Promise.all([
    getFullProfile(userId),
    getSituation(userId, companionId),
    getAffinity(userId, companionId),
    getNpcStates(userId, [companionId]),
  ]);
  let companionName = companionId;
  try { companionName = getCharacter(companionId).displayName; } catch { /* unknown id */ }
  const scene = situation.scene;
  return composeWorld({
    profile: full.profile,
    presentation: full.presentation,
    inventory: full.inventory,
    phase: scenePhase(scene),
    location: scene.location,
    companionId,
    companionName,
    companionAffinity: affinity,
    npcState: npcStates[companionId],
  });
}
