import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIntent, normalizeSubtype, parseRefereeOutput } from './intent';
import { consequencesFor, ARREST_AFFINITY_HIT } from './rules';
import { advanceNpcs, ACTION_THRESHOLD } from './agency';
import type { WorldState, NpcEntity, Relationship } from './world';
import { PLAYER } from './world';
import { emptyProfile } from './player';

const rel = (o: Partial<Relationship> = {}): Relationship => ({ affinity: 0, trust: 0, love: 0, resentment: 0, ...o });
function npc(over: Partial<NpcEntity> & { id: string; name: string }): NpcEntity {
  return {
    role: 'npc', location: 'mall', currentActivity: 'idling', mood: 'calm',
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
test('8 closed categories; unknown category rejected', () => {
  assert.equal(validateIntent({ type: 'crime', subtype: 'theft' })?.type, 'crime');
  assert.equal(validateIntent({ type: 'deception', subtype: 'lie' }), null); // not a top category anymore
  assert.equal(validateIntent({ type: 'summon_dragon', subtype: 'x' }), null);
});

test('subtype normalization collapses synonyms to canonical', () => {
  assert.equal(normalizeSubtype('romance', 'cute teasing flirt'), 'flirt');
  assert.equal(normalizeSubtype('romance', 'soft_flirt_attempt'), 'flirt');
  assert.equal(normalizeSubtype('crime', 'I robbed the register'), 'armed_robbery');
  assert.equal(normalizeSubtype('crime', 'shoplifting some dvds'), 'shoplift');
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
test('crime -> arrest; reckless warns; jailed inert', () => {
  assert.ok(consequencesFor({ type: 'crime', subtype: 'armed_robbery' }, world()).some((c) => c.type === 'arrest'));
  assert.ok(!consequencesFor({ type: 'crime', subtype: 'reckless_endangerment' }, world()).some((c) => c.type === 'arrest'));
  const jailed = world({ user: { location: 'jail', status: 'jailed', money: 0, profile: emptyProfile('You'), presentation: { wornItemIds: [], grooming: {} }, inventory: [] } });
  assert.deepEqual(consequencesFor({ type: 'crime', subtype: 'arson' }, jailed), []);
});

test('conflict insult drops affinity; threaten also warns', () => {
  assert.ok(consequencesFor({ type: 'conflict', subtype: 'insult' }, world()).some((c) => c.type === 'affinity' && c.delta < 0));
  assert.ok(consequencesFor({ type: 'conflict', subtype: 'threaten' }, world()).some((c) => c.type === 'authority_warn'));
});

test('romance/social/transaction consequences', () => {
  assert.ok(consequencesFor({ type: 'romance', subtype: 'confession' }, world()).some((c) => c.type === 'affinity' && c.delta > 1));
  assert.ok(consequencesFor({ type: 'social', subtype: 'compliment' }, world()).some((c) => c.type === 'affinity' && c.delta > 0));
  assert.ok(consequencesFor({ type: 'transaction', subtype: 'buy', magnitude: 'lavish' }, world()).some((c) => c.type === 'bill_add' && c.amount === 850));
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

test('deception boundary: social/lie is talk-only; crime/fraud is systemic (arrest)', () => {
  const lie = consequencesFor({ type: 'social', subtype: 'lie' }, world());
  assert.ok(!lie.some((c) => c.type === 'arrest'));
  assert.ok(lie.some((c) => c.type === 'affinity' && c.delta < 0));
  const fraud = consequencesFor({ type: 'crime', subtype: 'fraud' }, world());
  assert.ok(fraud.some((c) => c.type === 'arrest'));
});

test('transaction/buy bills ONLY with an explicit magnitude (no silent $80 default)', () => {
  assert.deepEqual(consequencesFor({ type: 'transaction', subtype: 'buy' }, world()), []);
  assert.ok(consequencesFor({ type: 'transaction', subtype: 'buy', magnitude: 'big' }, world()).some((c) => c.type === 'bill_add' && c.amount === 300));
});

