import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeWorld } from './compose';
import { refereeInputFromWorld } from './referee';
import { emptyProfile } from './player';

function pieces(over = {}) {
  return {
    profile: emptyProfile('Andrew'),
    presentation: { wornItemIds: [], grooming: {} },
    inventory: [],
    phase: 'on_date' as const,
    location: 'mall',
    companionId: 'serena',
    companionName: 'Serena',
    companionAffinity: 62,
    ...over,
  };
}

test('composeWorld: builds user + companion with seeded goals and live affinity', () => {
  const w = composeWorld(pieces());
  assert.equal(w.scene.companionId, 'serena');
  assert.equal(w.user.status, 'free');
  assert.equal(w.user.profile.displayName, 'Andrew');
  const serena = w.npcs.serena;
  assert.equal(serena.relationships.player.affinity, 62);
  assert.ok(serena.goals.length >= 1);          // from roster seed
  assert.ok(serena.fashionPrefs.includes('goth'));
  assert.deepEqual(w.scene.presentNpcIds, ['serena']); // present on a date
});

test('composeWorld: jailed phase -> user.status jailed; npc_state knowledge merges', () => {
  const w = composeWorld(pieces({ phase: 'jailed', npcState: { knowledge: { knownPlayerFacts: ['name', 'appearance'] } } }));
  assert.equal(w.user.status, 'jailed');
  assert.deepEqual(w.npcs.serena.knowledge.knownPlayerFacts, ['name', 'appearance']);
});

test('refereeInputFromWorld: surfaces companion, present, roster', () => {
  const input = refereeInputFromWorld(composeWorld(pieces()), '*kisses Serena*');
  assert.equal(input.scene.companion?.id, 'serena');
  assert.equal(input.message, '*kisses Serena*');
  assert.ok(input.roster.some((a) => a.id === 'serena'));
});
