// Layer 3: NPC agency. Behavior is a world-AGNOSTIC pair — score(ctx) -> number
// and execute(ctx) -> actions — registered by GOAL id. No special-case ladders
// like `if serena.isOnDate`. NPCs act on what they BELIEVE (perception), not on
// omniscient ground truth, so misinformation and surprise are possible. Pure +
// deterministic given an injected RNG.
import type { WorldState, NpcEntity, Goal } from './world';
import { PLAYER, belief } from './world';

export interface NpcAction { npc: string; action: string; reason: string; }
export interface Rng { next(): number; }
export interface BehaviorCtx { npc: NpcEntity; goal: Goal; world: WorldState; }
export interface Behavior {
  score(ctx: BehaviorCtx): number;       // opportunity 0..1
  execute(ctx: BehaviorCtx): NpcAction[]; // world-agnostic effects
}

export const ACTION_THRESHOLD = 0.45;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// --- Registry (the extension point) -----------------------------------------

/** Pursue/guard a love interest from a perceived rival (the player). Acts only
 *  on BELIEF that the interest is currently out with the player. */
const outcompetePlayer: Behavior = {
  score({ npc, goal, world }) {
    const li = goal.target ?? world.scene.companionId;
    const b = belief(npc, li);
    if (!b.withPlayer) return 0;                                  // doesn't believe they're together -> no urge
    if (world.scene.presentNpcIds.includes(npc.id)) return 0;     // already there
    const love = npc.relationships[li]?.love ?? 50;               // own attachment drives urgency
    return clamp01(0.3 + 0.5 * clamp01(love / 100));
  },
  execute({ npc, goal, world }) {
    const li = goal.target ?? world.scene.companionId;
    const name = world.npcs[li]?.name ?? li;
    return [{ npc: npc.id, action: 'interrupt_date', reason: `outcompete the player for ${name}` }];
  },
};

/** Generic: deepen a bond with someone who is present in the scene. */
const increaseCloseness: Behavior = {
  score({ npc, goal, world }) {
    const who = goal.target;
    if (!who) return 0;
    if (!world.scene.presentNpcIds.includes(npc.id)) return 0;
    if (who !== PLAYER && !world.scene.presentNpcIds.includes(who)) return 0;
    const rel = npc.relationships[who]?.affinity ?? 0;
    return clamp01(0.3 + 0.4 * clamp01((100 - rel) / 100));
  },
  execute({ npc, goal }) {
    return [{ npc: npc.id, action: 'make_a_move', reason: `grow closer to ${goal.target}` }];
  },
};

export const BEHAVIORS: Record<string, Behavior> = {
  outcompete_player: outcompetePlayer,
  increase_closeness: increaseCloseness,
};

/** Advances every NPC one tick from their GOALS (not the player's message). */
export function advanceNpcs(world: WorldState, rng: Rng): NpcAction[] {
  const fired: NpcAction[] = [];
  for (const id of Object.keys(world.npcs).sort()) {
    const npc = world.npcs[id];
    for (const goal of npc.goals) {
      const behavior = BEHAVIORS[goal.id];
      if (!behavior) continue;
      const ctx: BehaviorCtx = { npc, goal, world };
      const score = clamp01(behavior.score(ctx));
      if (score >= ACTION_THRESHOLD && rng.next() < score) fired.push(...behavior.execute(ctx));
    }
  }
  return fired;
}
