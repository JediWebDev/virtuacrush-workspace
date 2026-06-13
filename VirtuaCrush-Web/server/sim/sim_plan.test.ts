import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planEffects } from './effects';
import { consequencesFor } from './rules';
import { npcSeed, baseNpcEntity, ROSTER_IDS } from './roster';
import type { WorldState } from './world';
import { emptyProfile } from './player';

function world(): WorldState {
  return {
    tick: 1,
    user: { location: 'mall', status: 'free', money: 100, profile: emptyProfile('You'), presentation: { wornItemIds: [], grooming: {} }, inventory: [] },
    scene: { phase: 'on_date', where: 'mall', companionId: 'serena', presentNpcIds: ['serena'] },
    npcs: { serena: baseNpcEntity('serena') },
  };
}

test('roster: known companions seeded with goals + fashion prefs', () => {
  assert.ok(ROSTER_IDS.includes('serena'));
  assert.ok(ROSTER_IDS.includes('becca'));
  assert.deepEqual(npcSeed('serena')?.fashionPrefs.includes('goth'), true);
  assert.deepEqual(npcSeed('becca')?.fashionPrefs.includes('retro'), true);
  const e = baseNpcEntity('serena');
  assert.equal(e.goals[0].id, 'increase_closeness');
  assert.equal(e.knowledge.knownPlayerFacts.length, 0);
});

test('planEffects: purchase -> bill item; insult -> negative affinity only', () => {
  const buy = planEffects(consequencesFor({ type: 'transaction', subtype: 'buy', magnitude: 'lavish' }, world()));
  assert.equal(buy.billItems[0].amount, 850);
  const insult = planEffects(consequencesFor({ type: 'conflict', subtype: 'insult' }, world()));
  assert.ok(insult.affinityByNpc.serena < 0);
  assert.equal(insult.billItems.length, 0);
});

test('planEffects: affinity deltas from multiple consequences sum per npc', () => {
  const plan = planEffects([
    { type: 'affinity', npc: 'serena', delta: 1, reason: 'a' },
    { type: 'affinity', npc: 'serena', delta: -3, reason: 'b' },
  ]);
  assert.equal(plan.affinityByNpc.serena, -2);
});
