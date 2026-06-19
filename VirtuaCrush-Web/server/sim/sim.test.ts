import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIntent, normalizeSubtype, parseRefereeOutput } from './intent';
import { consequencesFor } from './rules';
import { advanceNpcs, ACTION_THRESHOLD } from './agency';
import type { WorldState, NpcEntity, Relationship } from './world';
import { PLAYER } from './world';
import { emptyProfile } from './player';

const rel = (o: Partial<Relationship> = {}): Relationship => ({ affinity: 0, trust: 0, love: 0, resentment: 0, ...o });
function npc(over: Partial<NpcEntity> & { id: string; name: string }): NpcEntity {
  return {
    role: 'npc', location: 'mall', currentActivity: 'idling', mood: 'calm', personality: { warmth: 0.5, volatility: 0.5, boldness: 0.5, extraversion: 0.5, grudge: 0.5 },
    appearance: {}, presentation: { wornItemIds: [], grooming: {} }, inventory: [], fashionPrefs: [],
    needs: {}, goals: [], relationships: {},
    knowledge: { knownLocations: [], beliefs: {}, knownPlayerFacts: [], lastSeenOutfit: {}, rumors: [] },
    memories: [], schedule: [], faction: null, economy: { money: 0, reputation: {} }, ...over,
  };
}
function world(over: Partial<WorldState> = {}): WorldState {
  return {
    tick: 1,
    user: { location: 'mall', status: 'free', money: 100, profile: emptyProfile('You'), presentation: { wornItemIds: [], grooming: {} }, inventory: [] },
    scene: { phase: 'on_date', where: 'mall', companionId: 'serena', presentNpcIds: ['serena'] },
    npcs: {
      serena: npc({ id: 'serena', name: 'Serena', role: 'companion', relationships: { [PLAYER]: rel({ affinity: 70, love: 30 }) } }),
      dereck: npc({
        id: 'dereck', name: 'Dereck', role: 'rival', location: 'away',
        goals: [{ id: 'outcompete_player', weight: 1, target: 'serena' }],
        relationships: { serena: rel({ affinity: 80, love: 80, tags: ['crush'] }) },
        // perception: Dereck BELIEVES Serena is out with the player.
        knowledge: { knownLocations: ['mall'], beliefs: { serena: { withPlayer: true, location: 'mall' } }, knownPlayerFacts: [], lastSeenOutfit: {}, rumors: [] },
      }),
    },
    ...over,
  };
}
const rng = (v: number) => ({ next: () => v });

// --- Layer 1: categories + subtype normalization -----------------------------
test('7 closed categories; unknown category rejected', () => {
  assert.equal(validateIntent({ type: 'social', subtype: 'smalltalk' })?.type, 'social');
  assert.equal(validateIntent({ type: 'deception', subtype: 'lie' }), null);
  assert.equal(validateIntent({ type: 'summon_dragon', subtype: 'x' }), null);
  assert.equal(validateIntent({ type: 'crime', subtype: 'theft' }), null); // crime removed
});

test('subtype normalization collapses synonyms to canonical', () => {
  assert.equal(normalizeSubtype('romance', 'cute teasing flirt'), 'flirt');
  assert.equal(normalizeSubtype('romance', 'soft_flirt_attempt'), 'flirt');
  assert.equal(normalizeSubtype('social', 'gave her a genuine compliment'), 'compliment');
  assert.equal(normalizeSubtype('conflict', 'mocked him harshly'), 'insult');
  assert.equal(normalizeSubtype('romance', 'totally novel vibe'), 'flirt'); // unknown -> category default
});

test('parseRefereeOutput normalizes + fails soft', () => {
  assert.deepEqual(parseRefereeOutput('junk').intent, { type: 'observation', subtype: 'wait' });
  const o = parseRefereeOutput('{"intent":{"type":"romance","subtype":"charismatic flirt"}}');
  assert.equal(o.intent.subtype, 'flirt');
});

// --- Layer 2: engine consequences --------------------------------------------
test('conflict insult drops affinity; threaten also warns', () => {
  assert.ok(consequencesFor({ type: 'conflict', subtype: 'insult' }, world()).some((c) => c.type === 'affinity' && c.delta < 0));
  assert.ok(consequencesFor({ type: 'conflict', subtype: 'threaten' }, world()).some((c) => c.type === 'authority_warn'));
});

test('romance/social consequences', () => {
  assert.ok(consequencesFor({ type: 'romance', subtype: 'confession' }, world()).some((c) => c.type === 'affinity' && c.delta > 0.4));
  assert.ok(consequencesFor({ type: 'social', subtype: 'compliment' }, world()).some((c) => c.type === 'affinity' && c.delta > 0));
});

test('neutral smalltalk and unknown social subtypes do not change affinity', () => {
  assert.deepEqual(consequencesFor({ type: 'social', subtype: 'smalltalk' }, world()), []);
  assert.deepEqual(consequencesFor({ type: 'social', subtype: 'totally_neutral_chat' }, world()), []);
  assert.deepEqual(consequencesFor({ type: 'observation', subtype: 'wait' }, world()), []);
});

// --- Layer 3: agency acts on BELIEF, not omniscience -------------------------
test('rival interrupts only because it BELIEVES they are together', () => {
  assert.equal(advanceNpcs(world(), rng(0)).length, 1);
});

test('no belief -> no action even though they really ARE on a date (not omniscient)', () => {
  const w = world();
  w.npcs.dereck.knowledge.beliefs = {}; // Dereck doesn't know
  assert.deepEqual(advanceNpcs(w, rng(0)), []);
});

test('odds miss or rival already present -> no action', () => {
  assert.deepEqual(advanceNpcs(world(), rng(0.999)), []);
  const present = world({ scene: { phase: 'on_date', where: 'mall', companionId: 'serena', presentNpcIds: ['serena', 'dereck'] } });
  assert.deepEqual(advanceNpcs(present, rng(0)), []);
});

test('behaviors are generic: registry-driven, threshold-gated', () => {
  assert.ok(ACTION_THRESHOLD > 0 && ACTION_THRESHOLD < 1);
});

test('social/lie is affinity-only (talk space, no criminal consequence)', () => {
  const lie = consequencesFor({ type: 'social', subtype: 'lie' }, world());
  assert.ok(lie.some((c) => c.type === 'affinity' && c.delta < 0));
  assert.ok(lie.every((c) => c.type !== 'authority_warn'));
});

test('transaction/buy without magnitude returns no consequences', () => {
  assert.deepEqual(consequencesFor({ type: 'transaction', subtype: 'buy' }, world()), []);
  assert.deepEqual(consequencesFor({ type: 'transaction', subtype: 'buy', magnitude: 'lavish' }, world()), []);
});
