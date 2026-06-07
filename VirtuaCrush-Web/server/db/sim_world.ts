// Assembles a live WorldState for (user, companion) by fetching the player
// profile, scene, affinity, and per-user npc_state, then composing them with the
// roster seed (pure composeWorld). Thin DB wrapper.
import { getFullProfile } from './profile';
import { getSituation } from './state';
import { getAffinity, getAllAffinity } from './affinity';
import { getNpcStates } from './npc_state';
import { scenePhase } from './scene_util';
import { getCharacter } from '../inworld/characters';
import { composeWorld } from '../sim/compose';
import { stepWorld, type TickResult } from '../sim/tick';
import { ROSTER_IDS, baseNpcEntity } from '../sim/roster';
import { upsertNpcState } from './npc_state';
import { createPost } from './posts';
import { insertWorldEvents, setWorldClock } from './world_sim';
import { PLAYER, type WorldState, type NpcEntity, type Relationship } from '../sim/world';

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

/** Loads the ENTIRE roster (seed + per-user npc_state + player affinity) into one
 *  WorldState — what the world tick operates over. NPC<->player affinity comes
 *  from character_affinity; NPC<->NPC relationships from npc_state. */
export async function assembleFullWorld(userId: string): Promise<WorldState> {
  const [full, states, affinities] = await Promise.all([
    getFullProfile(userId),
    getNpcStates(userId, ROSTER_IDS),
    getAllAffinity(userId),
  ]);
  const npcs: Record<string, NpcEntity> = {};
  for (const id of ROSTER_IDS) {
    const base = baseNpcEntity(id);
    const st = states[id];
    const relationships: Record<string, Relationship> = {};
    for (const [k, v] of Object.entries(st?.relationships ?? {})) {
      relationships[k] = { affinity: v.affinity ?? 0, trust: v.trust ?? 0, love: v.love ?? 0, resentment: v.resentment ?? 0, tags: v.tags };
    }
    const pl = relationships[PLAYER];
    relationships[PLAYER] = { affinity: affinities[id] ?? pl?.affinity ?? 0, trust: pl?.trust ?? 0, love: pl?.love ?? 0, resentment: pl?.resentment ?? 0, tags: pl?.tags };
    const k = st?.knowledge ?? {};
    npcs[id] = {
      ...base,
      mood: st?.mood ?? base.mood,
      location: st?.location ?? base.location,
      presentation: { wornItemIds: st?.currentOutfit ?? [], grooming: {} },
      needs: st && Object.keys(st.needs).length ? st.needs : base.needs,
      memories: st?.memories?.length ? st.memories : base.memories,
      relationships,
      knowledge: {
        knownLocations: base.knowledge.knownLocations,
        beliefs: ((k as Record<string, unknown>).beliefs as NpcEntity['knowledge']['beliefs']) ?? {},
        knownPlayerFacts: Array.isArray((k as Record<string, unknown>).knownPlayerFacts) ? ((k as Record<string, unknown>).knownPlayerFacts as string[]) : [],
        lastSeenOutfit: ((k as Record<string, unknown>).lastSeenOutfit as Record<string, string[]>) ?? {},
        rumors: Array.isArray((k as Record<string, unknown>).rumors) ? ((k as Record<string, unknown>).rumors as NpcEntity['knowledge']['rumors']) : [],
      },
    };
  }
  return {
    tick: 0,
    user: { location: 'home', status: 'free', money: 0, profile: full.profile, presentation: full.presentation, inventory: full.inventory },
    scene: { phase: 'home', where: 'home', companionId: ROSTER_IDS[0], presentNpcIds: [] },
    npcs,
  };
}

/** Persists a tick: writes each NPC's new state, NPCs' social posts, the activity
 *  log, and advances the world clock. */
export async function applyTick(userId: string, world: WorldState, result: TickResult, newSimMinutes: number): Promise<void> {
  const next = stepWorld(world, result.patches);
  for (const id of Object.keys(result.patches)) {
    const n = next.npcs[id];
    if (!n) continue;
    await upsertNpcState(userId, id, {
      mood: n.mood,
      location: n.location,
      currentOutfit: n.presentation.wornItemIds,
      relationships: n.relationships,
      needs: n.needs,
      memories: n.memories.slice(-50), // cap; salience-decay/compression is a later pass
      knowledge: n.knowledge as unknown as Record<string, unknown>,
    });
    const post = result.patches[id].post;
    if (post) {
      try { await createPost(userId, id, post); } catch (e) { console.warn('[tick] post failed:', e); }
    }
  }
  await insertWorldEvents(userId, result.events);
  await setWorldClock(userId, newSimMinutes);
}

