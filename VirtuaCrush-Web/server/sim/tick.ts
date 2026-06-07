// The world tick: a BEHAVIORAL simulation, not a probabilistic event generator.
// Each round runs DECIDE -> RESOLVE:
//   DECIDE  — every NPC chooses an `intent` (bond / argue / post / rest /
//             socialize) from its needs, relationships, mood, goals, and memory.
//   RESOLVE — the world turns intents into events + patches: interactions are
//             PAIRED via the relationship graph, mood changes CAUSALLY from
//             outcomes, memories (grudges/favors) accumulate, and rumors spread
//             by virality with decay/mutation.
// Movement is schedule-driven logistics (macro scope). Pure + deterministic
// given an injected RNG; no LLM (activity-log text is templated).
import type { WorldState, NpcEntity, NpcId, Rumor, Memory, ScheduleEntry } from './world';

export type IntentType = 'bond' | 'argue' | 'post' | 'rest' | 'socialize';
export interface Intent { type: IntentType; target?: NpcId; reason: string }
export type TickScope = 'micro' | 'macro';

export type WorldEventKind = 'move' | 'mood' | 'rumor' | 'interaction' | 'post';
export interface WorldEvent { at: number; kind: WorldEventKind; actors: string[]; text: string }
export interface RelDelta { target: string; affinity?: number; resentment?: number; love?: number }
export interface NpcPatch {
  location?: string;
  currentActivity?: string;
  mood?: string;
  addRumors?: Rumor[];
  relDeltas?: RelDelta[];
  addMemories?: Memory[];
  needDeltas?: Record<string, number>;
  post?: string;
}
export interface TickResult { events: WorldEvent[]; patches: Record<string, NpcPatch>; intents: Record<string, Intent> }
export interface Rng { next(): number }

const POSITIVE_MOODS = new Set(['cheerful', 'content', 'excited', 'calm']);
const BOND_ACTS = ['grabbed coffee together', 'swapped playlists', 'vented about their week', 'made weekend plans'];
const ARGUMENT_TOPICS = ['a movie', 'a band they both like', 'last weekend', 'an old grudge', 'a fashion choice'];

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const need = (npc: NpcEntity, k: string) => npc.needs[k] ?? 50;
const aff = (npc: NpcEntity, o: string) => npc.relationships[o]?.affinity ?? 0;
const resentment = (npc: NpcEntity, o: string) => npc.relationships[o]?.resentment ?? 0;
const nameOf = (world: WorldState, id: string) => world.npcs[id]?.name ?? id;
function patchFor(res: TickResult, id: string): NpcPatch { return (res.patches[id] ??= {}); }
function pick<T>(arr: T[], rng: Rng): T { return arr[Math.floor(rng.next() * arr.length)] ?? arr[0]; }
function mem(at: number, summary: string, weight: number): Memory { return { at, summary, weight }; }
function scheduleSlot(npc: NpcEntity, hour: number): ScheduleEntry | null {
  return npc.schedule.find((e) => hour >= e.fromHour && hour < e.toHour) ?? null;
}
function recentGrudge(npc: NpcEntity, otherName: string): boolean {
  return npc.memories.some((m) => /argu/i.test(m.summary) && m.summary.includes(otherName));
}
function conflictScore(npc: NpcEntity, o: string, world: WorldState): number {
  return clamp01((resentment(npc, o) + Math.max(0, -aff(npc, o))) / 100 + (recentGrudge(npc, nameOf(world, o)) ? 0.3 : 0));
}

/** DECIDE: choose the NPC's social intent from its state + who's around. */
export function decideIntent(npc: NpcEntity, others: string[], world: WorldState, rng: Rng): Intent {
  const social = need(npc, 'social');
  const rest = need(npc, 'rest');
  const cands: { i: Intent; s: number }[] = [
    { i: { type: 'rest', reason: 'worn out' }, s: clamp01((rest - 50) / 50 * 0.6 + (npc.mood === 'tired' ? 0.4 : 0)) },
    { i: { type: 'post', reason: 'wants to be seen' }, s: clamp01(0.1 + (social - 50) / 100 * 0.4 + (others.length === 0 ? 0.25 : 0)) },
  ];
  if (others.length) {
    const best = others.reduce((m, o) => (aff(npc, o) > aff(npc, m) ? o : m), others[0]);
    const worst = others.reduce((m, o) => (conflictScore(npc, o, world) > conflictScore(npc, m, world) ? o : m), others[0]);
    cands.push({ i: { type: 'bond', target: best, reason: `enjoys ${nameOf(world, best)}` }, s: clamp01(0.15 + aff(npc, best) / 100 * 0.6 + (social - 50) / 100 * 0.3 + (POSITIVE_MOODS.has(npc.mood) ? 0.15 : 0)) });
    cands.push({ i: { type: 'argue', target: worst, reason: `friction with ${nameOf(world, worst)}` }, s: clamp01(0.05 + conflictScore(npc, worst, world) * 0.9 + (npc.mood === 'annoyed' ? 0.3 : 0)) });
  }
  // goals steer behavior: pursue closeness with a present target
  for (const g of npc.goals) {
    if (g.id === 'increase_closeness' && g.target && others.includes(g.target)) {
      cands.push({ i: { type: 'bond', target: g.target, reason: `pursuing closeness with ${nameOf(world, g.target)}` }, s: 0.55 });
    }
  }
  for (const c of cands) c.s += rng.next() * 0.1; // small noise, not the driver
  return cands.sort((a, b) => b.s - a.s)[0].i;
}

function pairKey(a: string, b: string) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
function maybeMutate(text: string, rng: Rng): string {
  return rng.next() < 0.2 && !/^supposedly/i.test(text) ? `supposedly ${text}` : text;
}

/** One behavioral round at sim-minute `atMin`. Reads `world`; returns events + patches. */
export function simulateStep(world: WorldState, atMin: number, rng: Rng, scope: TickScope = 'macro'): TickResult {
  const res: TickResult = { events: [], patches: {}, intents: {} };
  const ids = Object.keys(world.npcs).sort();
  const hour = Math.floor((atMin % 1440) / 60);

  // --- movement (logistics, macro scope only) ---
  if (scope === 'macro') {
    for (const id of ids) {
      const npc = world.npcs[id];
      const slot = scheduleSlot(npc, hour);
      if (slot && slot.location !== npc.location) {
        const p = patchFor(res, id);
        p.location = slot.location;
        p.currentActivity = slot.activity;
        res.events.push({ at: atMin, kind: 'move', actors: [id], text: `${npc.name} headed to the ${slot.location.replace(/_/g, ' ')} (${slot.activity}).` });
      }
    }
  }

  const locOf = (id: string) => res.patches[id]?.location ?? world.npcs[id].location;
  const coLocated = (id: string) => ids.filter((o) => o !== id && locOf(o) === locOf(id));

  // --- DECIDE ---
  for (const id of ids) res.intents[id] = decideIntent(world.npcs[id], coLocated(id), world, rng);

  // --- RESOLVE ---
  const handled = new Set<string>();
  for (const id of ids) {
    const intent = res.intents[id];
    const npc = world.npcs[id];
    const p = patchFor(res, id);

    if ((intent.type === 'bond' || intent.type === 'argue') && intent.target) {
      const t = intent.target;
      if (handled.has(pairKey(id, t))) continue;
      handled.add(pairKey(id, t));
      const pt = patchFor(res, t);
      const A = nameOf(world, id);
      const B = nameOf(world, t);
      if (intent.type === 'argue') {
        (p.relDeltas ??= []).push({ target: t, affinity: -5, resentment: 5 });
        (pt.relDeltas ??= []).push({ target: id, affinity: -5, resentment: 5 });
        p.mood = pt.mood = 'annoyed';
        (p.addMemories ??= []).push(mem(atMin, `argued with ${B}`, 3));
        (pt.addMemories ??= []).push(mem(atMin, `argued with ${A}`, 3));
        (p.addRumors ??= []).push({ text: `${A} and ${B} are feuding`, credibility: 0.8, virality: 0.6, age: 0, source: id });
        res.events.push({ at: atMin, kind: 'interaction', actors: [id, t], text: `${A} and ${B} got into a heated argument about ${pick(ARGUMENT_TOPICS, rng)}.` });
      } else {
        (p.relDeltas ??= []).push({ target: t, affinity: 4 });
        (pt.relDeltas ??= []).push({ target: id, affinity: 4 });
        p.mood = pt.mood = 'content';
        (p.addMemories ??= []).push(mem(atMin, `bonded with ${B}`, 2));
        (pt.addMemories ??= []).push(mem(atMin, `bonded with ${A}`, 2));
        p.needDeltas = { ...(p.needDeltas ?? {}), social: -15 };
        pt.needDeltas = { ...(pt.needDeltas ?? {}), social: -15 };
        res.events.push({ at: atMin, kind: 'interaction', actors: [id, t], text: `${A} and ${B} ${pick(BOND_ACTS, rng)}.` });
      }
    } else if (intent.type === 'post' || intent.type === 'socialize') {
      const moodNow = p.mood ?? npc.mood;
      const recent = npc.memories[npc.memories.length - 1];
      const post = recent && rng.next() < 0.5 ? `still thinking about how I ${recent.summary} 🙃` : `feeling ${moodNow} today ✨`;
      p.post = post;
      p.needDeltas = { ...(p.needDeltas ?? {}), social: -10 };
      res.events.push({ at: atMin, kind: 'post', actors: [id], text: `${npc.name} posted: "${post}"` });
    } else if (intent.type === 'rest') {
      p.mood = p.mood ?? 'calm';
      p.needDeltas = { ...(p.needDeltas ?? {}), rest: -20 };
    }
  }

  // --- rumor spread (virality-driven; decays + mutates) ---
  for (const id of ids) {
    const rumors = world.npcs[id].knowledge.rumors;
    if (!rumors.length) continue;
    const top = rumors.reduce((m, r) => (r.virality * r.credibility > m.virality * m.credibility ? r : m), rumors[0]);
    if (top.credibility < 0.2) continue;
    for (const b of coLocated(id)) {
      const known = world.npcs[b].knowledge.rumors.some((r) => r.text === top.text) || (res.patches[b]?.addRumors ?? []).some((r) => r.text === top.text);
      if (known) continue;
      if (rng.next() < top.virality * top.credibility) {
        const spread: Rumor = { text: maybeMutate(top.text, rng), credibility: top.credibility * 0.9, virality: top.virality * 0.95, age: top.age + 1, source: id };
        (patchFor(res, b).addRumors ??= []).push(spread);
        res.events.push({ at: atMin, kind: 'rumor', actors: [b, id], text: `${nameOf(world, b)} heard from ${nameOf(world, id)} that ${top.text}.` });
        break;
      }
    }
  }

  // emit a mood event when an intent changed someone's mood (causal, not random)
  for (const id of ids) {
    const p = res.patches[id];
    if (p?.mood && p.mood !== world.npcs[id].mood && !res.events.some((e) => e.kind === 'interaction' && e.actors.includes(id))) {
      res.events.push({ at: atMin, kind: 'mood', actors: [id], text: `${nameOf(world, id)} is feeling ${p.mood}.` });
    }
  }

  return res;
}

// --- catch-up across an elapsed period (THREADED: patches applied between steps) ---
export const STEP_MINUTES = 60;
export const MAX_STEPS = 8;

/** Applies a tick's patches to a cloned world so the next step sees the changes. */
export function stepWorld(world: WorldState, patches: Record<string, NpcPatch>): WorldState {
  const npcs: Record<string, NpcEntity> = {};
  for (const [id, npc] of Object.entries(world.npcs)) {
    const p = patches[id];
    if (!p) { npcs[id] = npc; continue; }
    const relationships = { ...npc.relationships };
    for (const d of p.relDeltas ?? []) {
      const cur = relationships[d.target] ?? { affinity: 0, trust: 0, love: 0, resentment: 0 };
      relationships[d.target] = {
        ...cur,
        affinity: Math.max(-100, Math.min(100, cur.affinity + (d.affinity ?? 0))),
        resentment: Math.max(0, Math.min(100, cur.resentment + (d.resentment ?? 0))),
        love: Math.max(0, Math.min(100, cur.love + (d.love ?? 0))),
      };
    }
    const needs = { ...npc.needs };
    for (const [k, dv] of Object.entries(p.needDeltas ?? {})) needs[k] = Math.max(0, Math.min(100, (needs[k] ?? 50) + dv));
    npcs[id] = {
      ...npc,
      location: p.location ?? npc.location,
      currentActivity: p.currentActivity ?? npc.currentActivity,
      mood: p.mood ?? npc.mood,
      needs,
      relationships,
      memories: p.addMemories ? [...npc.memories, ...p.addMemories] : npc.memories,
      knowledge: p.addRumors ? { ...npc.knowledge, rumors: [...npc.knowledge.rumors, ...p.addRumors] } : npc.knowledge,
    };
  }
  return { ...world, npcs };
}

function mergePatch(into: NpcPatch, p: NpcPatch): void {
  if (p.location !== undefined) into.location = p.location;
  if (p.currentActivity !== undefined) into.currentActivity = p.currentActivity;
  if (p.mood !== undefined) into.mood = p.mood;
  if (p.post !== undefined) into.post = p.post;
  if (p.addRumors) into.addRumors = [...(into.addRumors ?? []), ...p.addRumors];
  if (p.relDeltas) into.relDeltas = [...(into.relDeltas ?? []), ...p.relDeltas];
  if (p.addMemories) into.addMemories = [...(into.addMemories ?? []), ...p.addMemories];
  if (p.needDeltas) into.needDeltas = { ...(into.needDeltas ?? {}), ...p.needDeltas };
}

/** Runs a capped number of THREADED steps over an idle gap (catch-up digest). */
export function simulateElapsed(world: WorldState, fromMin: number, elapsedMin: number, rng: Rng): TickResult {
  const steps = Math.max(1, Math.min(MAX_STEPS, Math.floor(elapsedMin / STEP_MINUTES) || 1));
  const merged: TickResult = { events: [], patches: {}, intents: {} };
  let working = world;
  for (let i = 0; i < steps; i++) {
    const atMin = fromMin + Math.floor(((i + 1) / steps) * elapsedMin);
    const step = simulateStep(working, atMin, rng, 'macro');
    merged.events.push(...step.events);
    for (const [id, p] of Object.entries(step.patches)) mergePatch((merged.patches[id] ??= {}), p);
    working = stepWorld(working, step.patches); // THREAD: next step sees the changes
  }
  return merged;
}
