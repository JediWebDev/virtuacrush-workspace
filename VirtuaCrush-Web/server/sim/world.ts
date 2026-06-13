// The authoritative world model. Identity, current presentation, and owned
// inventory are THREE separate systems (you don't become a new person when you
// change clothes), and the player + every NPC share the same structure so outfit
// rotation, gifts, shopping, attraction, and future image generation all read
// one schema. NPCs are not omniscient: what they know about another actor
// (including the player's current outfit) lives in their Knowledge, projected
// from ground truth.

export type NpcId = string;
export const PLAYER: NpcId = 'player';
export type UserStatus = 'free' | 'jailed';

export interface Goal { id: string; weight: number; target?: NpcId }
export interface Relationship { affinity: number; trust: number; love: number; resentment: number; tags?: string[] }
export interface Memory { at: number; summary: string; weight: number }
export interface ScheduleEntry { fromHour: number; toHour: number; location: string; activity: string }

export interface Belief { location?: string; activity?: string; withPlayer?: boolean; at?: number }

/** A piece of gossip with a lifecycle: it decays, mutates, and spreads by virality. */
export interface Rumor { text: string; credibility: number; virality: number; age: number; source?: NpcId }
export interface Knowledge {
  knownLocations: string[];
  beliefs: Record<NpcId, Belief>;          // knownNPCStates (partial, fallible)
  knownPlayerFacts: string[];              // which permanent player facts are learned
  lastSeenOutfit: Record<NpcId, string[]>; // last observed worn-item ids per actor (stale until re-seen)
  rumors: Rumor[];
  secretDiscovered?: boolean;            // has THIS player uncovered the companion's secret?
  drives?: Record<string, number>;       // LEGACY desire/quirk meters (superseded by emotions)
  drivesUpdatedAt?: string;              // ISO timestamp of last drive advance
  emotions?: Record<string, number>;     // 8-axis emotional state 0-100 for THIS player
  emotionsUpdatedAt?: string;            // ISO timestamp of last emotion update
  pendingDriveEvent?: { drive: string; prompt: string; options: { id: string; label: string }[] } | null;
  pendingDriveReaction?: string | null;  // directive injected into the next reply after a choice
}

// --- Permanent identity ------------------------------------------------------
export interface PermanentAppearance {
  age?: string; height?: string; build?: string; hair?: string; eyes?: string; features?: string;
}
export interface Biography {
  interests: string[]; hobbies: string[]; goals: string[]; fears: string[]; values: string[];
}
export interface PlayerProfile {
  displayName: string;
  appearance: PermanentAppearance;
  biography: Biography;
}

// --- Current presentation (changeable day to day) ----------------------------
export interface Grooming { hairstyle?: string; makeup?: string; fragrance?: string }
export interface PresentationState {
  wornItemIds: string[]; // references InventoryItem ids the actor owns
  grooming: Grooming;
}

/** A saved outfit the player can re-apply in one tap (worn changes constantly). */
export interface OutfitPreset { name: string; wornItemIds: string[] }

// --- Wardrobe / owned items --------------------------------------------------
export type ItemCategory = 'top' | 'bottom' | 'outerwear' | 'dress' | 'shoes' | 'accessory' | 'other';
export interface InventoryItem {
  id: string;
  category: ItemCategory;
  name: string;
  styleTags: string[];   // e.g. ['alternative','rock','edgy'] — drives attraction + image gen
  rarity?: string;       // 'common' | 'rare' | ...
  ownership?: NpcId;     // current owner (for gifts/shopping/transfers)
}

export interface Economy { money: number; reputation: Record<string, number> }
export type Faction = 'mall_staff' | 'civilian' | 'security' | null;

/** Stable Tier-1 traits (0..1) — the DOMINANT control signal. Goals, mood,
 *  memory, and rumors modulate behavior; personality anchors it so NPCs stay
 *  legible and emotionally readable. */
export interface Personality {
  warmth: number;       // tendency to bond / be agreeable
  volatility: number;   // mood swing + escalation speed
  boldness: number;     // willingness to act vs. defer (friction)
  extraversion: number; // social drive / posting
  grudge: number;       // how hard memories bias future intent
}

export interface NpcEntity {
  id: NpcId;
  name: string;
  role: string;
  location: string;
  currentActivity: string;
  mood: string;                          // short-term weather
  personality: Personality;              // stable Tier-1 traits
  appearance: PermanentAppearance;       // permanent identity
  presentation: PresentationState;       // what they're wearing now
  inventory: InventoryItem[];            // their wardrobe + owned items
  fashionPrefs: string[];                // liked style tags (attraction)
  needs: Record<string, number>;
  goals: Goal[];
  relationships: Record<NpcId, Relationship>; // long-term love/resentment live here
  knowledge: Knowledge;                  // perception (NOT omniscient)
  memories: Memory[];
  schedule: ScheduleEntry[];
  faction: Faction;
  economy: Economy;
}

export interface WorldState {
  tick: number;
  user: {
    location: string;
    status: UserStatus;
    jailedUntil?: string | null;
    money: number;
    profile: PlayerProfile;          // permanent identity
    presentation: PresentationState; // current outfit/grooming
    inventory: InventoryItem[];      // wardrobe
  };
  scene: { phase: 'home' | 'on_date' | 'jailed'; where: string; companionId: NpcId; presentNpcIds: NpcId[] };
  npcs: Record<NpcId, NpcEntity>;
}

const EMPTY_REL: Relationship = { affinity: 0, trust: 0, love: 0, resentment: 0 };
export function feelingTowardPlayer(npc: NpcEntity): Relationship {
  return npc.relationships[PLAYER] ?? EMPTY_REL;
}
export function belief(npc: NpcEntity, aboutId: NpcId): Belief {
  return npc.knowledge.beliefs[aboutId] ?? {};
}
