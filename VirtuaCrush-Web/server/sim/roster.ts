// Base NPC entity seeds for the existing roster. This is the GLOBAL, mostly-
// static identity of each character (goals, fashion preferences, faction, base
// appearance); the per-user mutable parts (relationship toward the player,
// knowledge, current outfit, mood) are persisted separately (npc_state) and
// merged in when a WorldState is assembled. Pure data + helpers.
import type { NpcEntity, PermanentAppearance, Goal, Personality, ScheduleEntry } from './world';
import { PLAYER } from './world';

export interface NpcSeed {
  id: string;
  name: string;
  role: string;
  goals: Goal[];
  fashionPrefs: string[];
  faction: NpcEntity['faction'];
  appearance: PermanentAppearance;
  personality: Personality;
}

// Fashion prefs come from each persona's vibe so outfitAppeal reacts in-character.
const SEEDS: Record<string, NpcSeed> = {
  mina: { id: 'mina', name: 'Mina', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['cute', 'gamer', 'cozy', 'kawaii'], faction: 'civilian', appearance: {}, personality: { warmth: 0.7, volatility: 0.5, boldness: 0.5, extraversion: 0.8, grudge: 0.3 } },
  becca: { id: 'becca', name: 'Becca', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['retro', '90s', 'casual', 'vintage'], faction: 'civilian', appearance: {}, personality: { warmth: 0.6, volatility: 0.5, boldness: 0.6, extraversion: 0.5, grudge: 0.6 } },
  madison: { id: 'madison', name: 'Madison', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['preppy', 'pink', 'sparkle', 'chic'], faction: 'civilian', appearance: {}, personality: { warmth: 0.7, volatility: 0.6, boldness: 0.7, extraversion: 0.9, grudge: 0.4 } },
  jordan: { id: 'jordan', name: 'Jordan', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['athletic', 'sporty', 'casual'], faction: 'civilian', appearance: {}, personality: { warmth: 0.6, volatility: 0.6, boldness: 0.8, extraversion: 0.7, grudge: 0.4 } },
  serena: { id: 'serena', name: 'Serena', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['alternative', 'goth', 'emo', 'grunge'], faction: 'civilian', appearance: { hair: 'white' }, personality: { warmth: 0.6, volatility: 0.3, boldness: 0.3, extraversion: 0.3, grudge: 0.4 } },
  riot: { id: 'riot', name: 'Riot', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['indie', 'rock', 'edgy', 'vintage'], faction: 'civilian', appearance: {}, personality: { warmth: 0.6, volatility: 0.7, boldness: 0.7, extraversion: 0.7, grudge: 0.5 } },
  avery: { id: 'avery', name: 'Avery', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['cozy', 'casual', 'soft'], faction: 'civilian', appearance: {}, personality: { warmth: 0.8, volatility: 0.3, boldness: 0.4, extraversion: 0.5, grudge: 0.3 } },
  jun: { id: 'jun', name: 'Jun', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['classic', 'smart', 'minimal'], faction: 'civilian', appearance: {}, personality: { warmth: 0.6, volatility: 0.2, boldness: 0.5, extraversion: 0.4, grudge: 0.3 } },
  iris: { id: 'iris', name: 'Iris', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.5, target: PLAYER }], fashionPrefs: ['natural', 'zen', 'earthy'], faction: 'civilian', appearance: {}, personality: { warmth: 0.7, volatility: 0.2, boldness: 0.4, extraversion: 0.3, grudge: 0.2 } },
  ash: { id: 'ash', name: 'Ash', role: 'companion', goals: [{ id: 'increase_closeness', weight: 0.6, target: PLAYER }], fashionPrefs: ['rugged', 'outdoors', 'practical'], faction: 'civilian', appearance: {}, personality: { warmth: 0.6, volatility: 0.4, boldness: 0.8, extraversion: 0.4, grudge: 0.4 } },
};

// Daytime + evening haunts. Overlaps create co-location, which is what lets the
// tick generate interactions, arguments, and rumors.
const SPOTS: Record<string, { day: string; eve: string }> = {
  mina: { day: 'arcade', eve: 'mall' },
  becca: { day: 'mall', eve: 'movie_theater' },
  madison: { day: 'coffee_shop', eve: 'restaurant' },
  jordan: { day: 'golf_course', eve: 'restaurant' },
  serena: { day: 'mall', eve: 'movie_theater' },
  riot: { day: 'coffee_shop', eve: 'concert' },
  avery: { day: 'coffee_shop', eve: 'mall' },
  jun: { day: 'coffee_shop', eve: 'restaurant' },
  iris: { day: 'park', eve: 'coffee_shop' },
  ash: { day: 'park', eve: 'mall' },
};

function buildSchedule(id: string): ScheduleEntry[] {
  const s = SPOTS[id] ?? { day: 'coffee_shop', eve: 'mall' };
  return [
    { fromHour: 0, toHour: 9, location: 'home', activity: 'at home' },
    { fromHour: 9, toHour: 17, location: s.day, activity: 'out and about' },
    { fromHour: 17, toHour: 23, location: s.eve, activity: 'socializing' },
    { fromHour: 23, toHour: 24, location: 'home', activity: 'winding down' },
  ];
}

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
    schedule: buildSchedule(id),
    faction: seed?.faction ?? 'civilian',
    economy: { money: 0, reputation: {} },
    personality: seed?.personality ?? { warmth: 0.5, volatility: 0.5, boldness: 0.5, extraversion: 0.5, grudge: 0.5 },
  };
}
