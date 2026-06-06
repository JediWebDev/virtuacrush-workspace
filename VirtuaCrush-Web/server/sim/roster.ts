// Base NPC entity seeds for the existing roster. This is the GLOBAL, mostly-
// static identity of each character (goals, fashion preferences, faction, base
// appearance); the per-user mutable parts (relationship toward the player,
// knowledge, current outfit, mood) are persisted separately (npc_state) and
// merged in when a WorldState is assembled. Pure data + helpers.
import type { NpcEntity, PermanentAppearance, Goal } from './world';
import { PLAYER } from './world';

export interface NpcSeed {
  id: string;
  name: string;
  role: string;
  goals: Goal[];
  fashionPrefs: string[];
  faction: NpcEntity['faction'];
  appearance: PermanentAppearance;
}

// Fashion prefs come from each persona's vibe so outfitAppeal reacts in-character.
const SEEDS: Record<string, NpcSeed> = {
  mina: { id: 'mina', name: 'Mina', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['cute', 'gamer', 'cozy', 'kawaii'], faction: 'civilian', appearance: {} },
  becca: { id: 'becca', name: 'Becca', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['retro', '90s', 'casual', 'vintage'], faction: 'civilian', appearance: {} },
  madison: { id: 'madison', name: 'Madison', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['preppy', 'pink', 'sparkle', 'chic'], faction: 'civilian', appearance: {} },
  jordan: { id: 'jordan', name: 'Jordan', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['athletic', 'sporty', 'casual'], faction: 'civilian', appearance: {} },
  serena: { id: 'serena', name: 'Serena', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['alternative', 'goth', 'emo', 'grunge'], faction: 'civilian', appearance: { hair: 'white' } },
  riot: { id: 'riot', name: 'Riot', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['indie', 'rock', 'edgy', 'vintage'], faction: 'civilian', appearance: {} },
  avery: { id: 'avery', name: 'Avery', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['cozy', 'casual', 'soft'], faction: 'civilian', appearance: {} },
  jun: { id: 'jun', name: 'Jun', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['classic', 'smart', 'minimal'], faction: 'civilian', appearance: {} },
  iris: { id: 'iris', name: 'Iris', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.5, target: PLAYER }], fashionPrefs: ['natural', 'zen', 'earthy'], faction: 'civilian', appearance: {} },
  ash: { id: 'ash', name: 'Ash', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['rugged', 'outdoors', 'practical'], faction: 'civilian', appearance: {} },
};

export const ROSTER_IDS = Object.keys(SEEDS);
export function npcSeed(id: string): NpcSeed | null {
  return SEEDS[id] ?? null;
}

/** A full NpcEntity from a seed, with all mutable fields at empty defaults. */
export function baseNpcEntity(id: string, name = id): NpcEntity {
  const seed = SEEDS[id];
  return {
    id,
    name: seed?.name ?? name,
    role: seed?.role ?? 'npc',
    location: 'home',
    currentActivity: 'going about their day',
    mood: 'neutral',
    appearance: seed?.appearance ?? {},
    presentation: { wornItemIds: [], grooming: {} },
    inventory: [],
    fashionPrefs: seed?.fashionPrefs ?? [],
    needs: {},
    goals: seed?.goals ?? [],
    relationships: {},
    knowledge: { knownLocations: [], beliefs: {}, knownPlayerFacts: [], lastSeenOutfit: {}, rumors: [] },
    memories: [],
    schedule: [],
    faction: seed?.faction ?? 'civilian',
    economy: { money: 0, reputation: {} },
  };
}
