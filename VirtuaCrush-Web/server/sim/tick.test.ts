import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideIntent, simulateStep, simulateElapsed, stepWorld } from './tick';
import { baseNpcEntity } from './roster';
import { emptyProfile } from './player';
import type { WorldState, NpcEntity, Rumor, Relationship } from './world';

const rel = (o: Partial<Relationship> = {}): Relationship => ({ affinity: 0, trust: 0, love: 0, resentment: 0, ...o });
function npc(id: string, over: Partial<NpcEntity>): NpcEntity {
  const base = baseNpcEntity(id);
  return { ...base, schedule: [], ...over, knowledge: { ...base.knowledge, ...(over.knowledge ?? {}) } };
}
function world(npcs: Record<string, NpcEntity>): WorldState {
  return {
    tick: 0,
    user: { location: 'home', status: 'free', money: 0, profile: emptyProfile('You'), presentation: { wornItemIds: [], grooming: {} }, inventory: [] },
    scene: { phase: 'home', where: 'home', companionId: 'serena', presentNpcIds: [] },
    npcs,
  };
}
const rng = (v: number) => ({ next: () => v });

// --- DECIDE -----------------------------------------------------------------
test('decideIntent: a present friend -> bond; a present rival -> argue', () => {
  const friendW = world({
    serena: npc('serena', { location: 'mall', mood: 'calm', needs: { social: 60 }, relationships: { becca: rel({ affinity: 80 }) } }),
    becca: npc('becca', { location: 'mall' }),
  });
  const bond = decideIntent(friendW.npcs.serena, ['becca'], friendW, rng(0));
  assert.equal(bond.type, 'bond');
  assert.equal(bond.target, 'becca');

  const rivalW = world({
    serena: npc('serena', { location: 'mall', mood: 'annoyed', relationships: { becca: rel({ affinity: -40, resentment: 60 }) } }),
    becca: npc('becca', { location: 'mall' }),
  });
  const argue = decideIntent(rivalW.npcs.serena, ['becca'], rivalW, rng(0));
  assert.equal(argue.type, 'argue');
});

test('decideIntent: alone + high social need -> post; tired + high rest need -> rest', () => {
  const w = world({ serena: npc('serena', { needs: { social: 90 }, mood: 'neutral' }) });
  assert.equal(decideIntent(w.npcs.serena, [], w, rng(0)).type, 'post');
  const tired = world({ serena: npc('serena', { needs: { rest: 90 }, mood: 'tired' }) });
  assert.equal(decideIntent(tired.npcs.serena, [], tired, rng(0)).type, 'rest');
});

// --- RESOLVE ----------------------------------------------------------------
test('bond resolves to positive deltas, content mood, and a memory', () => {
  const w = world({
    becca: npc('becca', { location: 'mall', mood: 'calm', needs: { social: 70 }, relationships: { serena: rel({ affinity: 80 }) } }),
    serena: npc('serena', { location: 'mall', mood: 'calm', needs: { social: 70 }, relationships: { becca: rel({ affinity: 80 }) } }),
  });
  const res = simulateStep(w, 600, rng(0));
  const inter = res.events.find((e) => e.kind === 'interaction');
  assert.ok(inter && !/argument/.test(inter.text));
  assert.ok((res.patches.becca.relDeltas ?? []).some((d) => d.target === 'serena' && (d.affinity ?? 0) > 0));
  assert.equal(res.patches.becca.mood, 'content');
  assert.ok((res.patches.becca.addMemories ?? []).some((m) => /bonded/.test(m.summary)));
});

test('argue resolves to negative deltas, annoyed mood, a grudge memory, and a feud rumor', () => {
  const w = world({
    becca: npc('becca', { location: 'mall', mood: 'annoyed', relationships: { serena: rel({ affinity: -40, resentment: 60 }) } }),
    serena: npc('serena', { location: 'mall', mood: 'annoyed', relationships: { becca: rel({ affinity: -40, resentment: 60 }) } }),
  });
  const res = simulateStep(w, 600, rng(0));
  assert.ok(res.events.some((e) => e.kind === 'interaction' && /argument/.test(e.text)));
  assert.ok((res.patches.becca.relDeltas ?? []).some((d) => (d.affinity ?? 0) < 0 && (d.resentment ?? 0) > 0));
  assert.equal(res.patches.becca.mood, 'annoyed');
  assert.ok((res.patches.becca.addMemories ?? []).some((m) => /argued/.test(m.summary)));
  assert.ok((res.patches.becca.addRumors ?? []).some((r) => /feuding/.test(r.text)));
});

// --- rumors -----------------------------------------------------------------
const viral: Rumor = { text: 'Becca dyed her hair', credibility: 0.9, virality: 0.9, age: 0 };
test('rumor: a viral, credible rumor spreads to a co-located NPC', () => {
  const w = world({
    becca: npc('becca', { location: 'mall', knowledge: { knownLocations: [], beliefs: {}, knownPlayerFacts: [], lastSeenOutfit: {}, rumors: [viral] } }),
    serena: npc('serena', { location: 'mall' }),
  });
  const res = simulateStep(w, 600, rng(0));
  assert.ok(res.events.some((e) => e.kind === 'rumor'));
  assert.ok((res.patches.serena.addRumors ?? []).some((r) => /dyed her hair/.test(r.text)));
});

test('rumor: a low-credibility rumor does not spread', () => {
  const stale: Rumor = { text: 'old news', credibility: 0.1, virality: 0.9, age: 9 };
  const w = world({
    becca: npc('becca', { location: 'mall', knowledge: { knownLocations: [], beliefs: {}, knownPlayerFacts: [], lastSeenOutfit: {}, rumors: [stale] } }),
    serena: npc('serena', { location: 'mall' }),
  });
  const res = simulateStep(w, 600, rng(0));
  assert.ok(!res.events.some((e) => e.kind === 'rumor'));
});

// --- threading --------------------------------------------------------------
test('stepWorld threads state so catch-up steps build on each other', () => {
  const w = world({
    becca: npc('becca', { location: 'mall', mood: 'calm', needs: { social: 80 }, relationships: { serena: rel({ affinity: 80 }) } }),
    serena: npc('serena', { location: 'mall', mood: 'calm', needs: { social: 80 }, relationships: { becca: rel({ affinity: 80 }) } }),
  });
  const res = simulateElapsed(w, 0, 120, rng(0)); // 2 threaded steps
  const bonds = (res.patches.becca.relDeltas ?? []).filter((d) => d.target === 'serena');
  assert.equal(bonds.length, 2); // bonded once per step -> proves steps ran threaded
});

test('stepWorld applies relationship + mood deltas to a fresh world', () => {
  const w = world({ becca: npc('becca', { mood: 'calm', relationships: { serena: rel({ affinity: 10 }) } }), serena: npc('serena', {}) });
  const next = stepWorld(w, { becca: { mood: 'annoyed', relDeltas: [{ target: 'serena', affinity: -5, resentment: 5 }] } });
  assert.equal(next.npcs.becca.mood, 'annoyed');
  assert.equal(next.npcs.becca.relationships.serena.affinity, 5);
  assert.equal(next.npcs.becca.relationships.serena.resentment, 5);
  assert.equal(w.npcs.becca.mood, 'calm'); // original unchanged (pure)
});
