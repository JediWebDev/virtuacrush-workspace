/**
 * Attach resolved scene NPCs to WorldState so agency + chaos can reason about
 * friends, rivals, and bystanders with the same schema the director uses.
 */
import type { ResolvedSceneNpc } from '../inworld/npc_schema';
import { baseNpcEntity } from './roster';
import { PLAYER, type Goal, type NpcEntity, type WorldState } from './world';

export function npcEntityIdFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug ? `npc:${slug}` : 'npc:unknown';
}

function goalsForSceneNpc(n: ResolvedSceneNpc, companionId: string): Goal[] {
  if (n.stance === 'enemy' && n.canDisrupt) {
    return [{ id: 'outcompete_player', weight: 0.7, target: companionId }];
  }
  if (n.stance === 'friend') {
    return [{ id: 'increase_closeness', weight: 0.5, target: companionId }];
  }
  return [];
}

function isPresentInScene(n: ResolvedSceneNpc, coPresent: boolean): boolean {
  if (!coPresent) return false;
  return n.stance === 'friend' || n.stance === 'bystander' || n.stance === 'enemy';
}

/** Returns a copy of world with scene NPC stubs merged in. */
export function enrichWorldWithSceneNpcs(
  world: WorldState,
  resolved: ResolvedSceneNpc[],
  opts: { companionId: string; coPresent: boolean },
): WorldState {
  const present = new Set(world.scene.presentNpcIds);
  const npcs: Record<string, NpcEntity> = { ...world.npcs };

  for (const n of resolved) {
    const id = npcEntityIdFromName(n.name);
    if (id === opts.companionId) continue;

    if (!npcs[id]) {
      const base = baseNpcEntity(id, n.name);
      npcs[id] = {
        ...base,
        role: n.stance,
        goals: goalsForSceneNpc(n, opts.companionId),
        relationships: {
          [opts.companionId]: {
            affinity: n.stance === 'friend' ? 60 : 25,
            trust: n.stance === 'friend' ? 50 : 20,
            love: n.stance === 'enemy' ? 65 : 15,
            resentment: n.stance === 'enemy' ? 35 : 0,
          },
          [PLAYER]: {
            affinity: n.stance === 'friend' ? 35 : n.stance === 'enemy' ? -5 : 0,
            trust: 20,
            love: 0,
            resentment: n.stance === 'enemy' ? 25 : 0,
          },
        },
        knowledge: {
          ...base.knowledge,
          beliefs: {
            [opts.companionId]: {
              withPlayer: opts.coPresent || world.scene.phase === 'on_date',
              location: world.scene.where,
            },
          },
        },
      };
    }

    if (isPresentInScene(n, opts.coPresent)) present.add(id);
  }

  return {
    ...world,
    npcs,
    scene: { ...world.scene, presentNpcIds: [...present] },
  };
}

/** Map a scene NPC display name to its sim entity id (if enriched). */
export function sceneNpcEntityId(name: string): string {
  return npcEntityIdFromName(name);
}
