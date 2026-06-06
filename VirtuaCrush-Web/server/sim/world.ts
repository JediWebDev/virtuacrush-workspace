// The authoritative world model (source of truth). Every actor is a full entity
// with goals, needs, relationships, a PERCEPTION model (what it believes is true
// — not omniscient), short-term mood AND long-term emotional bonds, memories, and
// a schedule. The sim ticks these; the LLM bookends only read a compact view.

export type NpcId = string;
export const PLAYER: NpcId = 'player';
export type UserStatus = 'free' | 'jailed';

export interface Goal {
  id: string;        // behavior id, e.g. 'outcompete_player', 'increase_closeness'
  weight: number;    // 0..1
  target?: NpcId;
}

/** Interpersonal standing. Short-term `affinity` swings; `love`/`resentment` are
 *  the durable bonds that DON'T reset between scenes (so romance feels earned). */
export interface Relationship {
  affinity: number;    // short-term warmth, -100..100
  trust: number;       // 0..100
  love: number;        // long-term romantic bond, 0..100
  resentment: number;  // long-term grudge, 0..100
  tags?: string[];     // ['crush'] ['rival'] ['friend']
}

export interface Memory { at: number; summary: string; weight: number; }
export interface ScheduleEntry { fromHour: number; toHour: number; location: string; activity: string; }

/** What an NPC BELIEVES about another actor — may be wrong or stale. Perception. */
export interface Belief { location?: string; activity?: string; withPlayer?: boolean; at?: number; }
export interface Knowledge {
  knownLocations: string[];
  beliefs: Record<NpcId, Belief>; // knownNPCStates (partial, fallible)
  rumors: string[];
}

export interface NpcEntity {
  id: NpcId;
  name: string;
  role: string;                 // 'companion' | 'rival' | 'staff' | 'friend' ...
  location: string;
  currentActivity: string;
  mood: string;                 // SHORT-TERM weather: 'calm' | 'excited' | 'angry'
  needs: Record<string, number>;
  goals: Goal[];
  relationships: Record<NpcId, Relationship>; // long-term affect lives here (love/resentment)
  knowledge: Knowledge;         // perception model (NOT omniscient)
  memories: Memory[];
  schedule: ScheduleEntry[];
}

export interface WorldState {
  tick: number;
  user: { location: string; status: UserStatus; jailedUntil?: string | null; money: number; inventory: string[] };
  scene: { phase: 'home' | 'planning' | 'on_date' | 'jailed'; where: string; companionId: NpcId; presentNpcIds: NpcId[] };
  npcs: Record<NpcId, NpcEntity>;
}

const EMPTY_REL: Relationship = { affinity: 0, trust: 0, love: 0, resentment: 0 };
export function feelingTowardPlayer(npc: NpcEntity): Relationship {
  return npc.relationships[PLAYER] ?? EMPTY_REL;
}
/** What `npc` currently believes about `aboutId` (empty if it knows nothing). */
export function belief(npc: NpcEntity, aboutId: NpcId): Belief {
  return npc.knowledge.beliefs[aboutId] ?? {};
}
