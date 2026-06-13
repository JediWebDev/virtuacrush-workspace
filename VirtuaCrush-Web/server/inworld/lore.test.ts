import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LORE, getLore, formatCharacterFactsBlock } from './lore';

const NO_CAR = ['mina', 'becca', 'serena', 'jun', 'avery', 'riot', 'lin'];
const HAS_CAR = ['madison', 'jordan', 'iris', 'ash', 'lexi'];

test('every character has complete, valid logistics', () => {
  for (const [id, lore] of Object.entries(LORE)) {
    assert.equal(typeof lore.hasCar, 'boolean', `${id} hasCar`);
    assert.ok(lore.transport.length > 0, `${id} transport`);
    assert.ok(lore.datePreference.length > 0, `${id} datePreference`);
  }
});

test('car ownership matches the spec', () => {
  for (const id of NO_CAR) assert.equal(getLore(id).hasCar, false, `${id} has no car`);
  for (const id of HAS_CAR) assert.equal(getLore(id).hasCar, true, `${id} has a car`);
});

test('formatCharacterFactsBlock states car status', () => {
  assert.ok(formatCharacterFactsBlock(getLore('serena')).includes('do NOT have a car'));
  assert.ok(formatCharacterFactsBlock(getLore('madison')).includes('have your own car'));
});
