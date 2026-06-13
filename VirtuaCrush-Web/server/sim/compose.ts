// Pure assembly of a WorldState from already-fetched pieces (player profile +
// scene + companion affinity + per-user npc_state + roster seed). The DB-fetching
// wrapper lives in db/sim_world.ts; keeping the composition pure makes it
// testable. v1 includes the companion as the sole sim NPC; rivals/others slot in
// here later.
import type { WorldState, NpcEntity, PlayerProfile, PresentationState, InventoryItem, Rumor } from './world';
import { PLAYER } from './world';
import { baseNpcEntity } from './roster';

export interface ComposePieces {
  profile: PlayerProfile;
  presentation: PresentationState;
  inventory: InventoryItem[];
  phase: 'home' | 'on_date';
  location: string | null;
  companionId: string;
  companionName: string;
  companionAffinity: number;
  npcState?: {
    mood?: string; location?: string; currentOutfit?: string[];
    relationship?: { trust?: number; love?: number; resentment?: number; tags?: string[] };
    knowledge?: Record<string, unknown>;
  };
}

export function composeWorld(p: ComposePieces): WorldState {
  const base = baseNpcEntity(p.companionId, p.companionName);
  const k = (p.npcState?.knowledge ?? {}) as Record<string, unknown>;
  const companion: NpcEntity = {
    ...base,
    mood: p.npcState?.mood ?? base.mood,
    location: p.phase === 'on_date' ? (p.location ?? base.location) : (p.npcState?.location ?? p.location ?? base.location),
    presentation: { wornItemIds: p.npcState?.currentOutfit ?? [], grooming: {} },
    relationships: {
      [PLAYER]: {
        affinity: p.companionAffinity,
        trust: p.npcState?.relationship?.trust ?? 0,
        love: p.npcState?.relationship?.love ?? 0,
        resentment: p.npcState?.relationship?.resentment ?? 0,
        tags: p.npcState?.relationship?.tags,
      },
    },
    knowledge: {
      knownLocations: Array.isArray(k.knownLocations) ? (k.knownLocations as string[]) : base.knowledge.knownLocations,
      beliefs: (k.beliefs ?? {}) as NpcEntity['knowledge']['beliefs'],
      knownPlayerFacts: Array.isArray(k.knownPlayerFacts) ? (k.knownPlayerFacts as string[]) : [],
      lastSeenOutfit: (k.lastSeenOutfit ?? {}) as Record<string, string[]>,
      rumors: Array.isArray(k.rumors) ? (k.rumors as Rumor[]) : [],
    },
  };
  return {
    tick: 0,
    user: {
      location: p.location ?? 'home',
      status: 'free' as const,
      money: 0,
      profile: p.profile,
      presentation: p.presentation,
      inventory: p.inventory,
    },
    scene: {
      phase: p.phase,
      where: p.location ?? 'home',
      companionId: p.companionId,
      presentNpcIds: p.phase === 'on_date' ? [p.companionId] : [],
    },
    npcs: { [p.companionId]: companion },
  };
}
