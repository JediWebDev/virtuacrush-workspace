import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LORE, getLore, formatCharacterFactsBlock } from './lore';
import { LOCATIONS, coerceDateLocation } from './scenes';

const NO_CAR = ['mina', 'becca', 'serena', 'jun', 'avery', 'riot'];
const HAS_CAR = ['madison', 'jordan', 'iris', 'ash'];

test('every character has complete, valid logistics + date prefs', () => {
  for (const [id, lore] of Object.entries(LORE)) {
    assert.equal(typeof lore.hasCar, 'boolean', `${id} hasCar`);
    assert.ok(lore.transport.length > 0, `${id} transport`);
    assert.ok(lore.datePreference.length > 0, `${id} datePreference`);
    assert.ok(lore.preferredLocations.length >= 2, `${id} has prefs`);
    for (const slug of lore.preferredLocations) {
      assert.ok(LOCATIONS[slug], `${id} pref ${slug} exists`);
      assert.notEqual(LOCATIONS[slug].kind, 'home', `${id} pref ${slug} is dateable`);
    }
  }
});

test('car ownership matches the spec', () => {
  for (const id of NO_CAR) assert.equal(getLore(id).hasCar, false, `${id} has no car`);
  for (const id of HAS_CAR) assert.equal(getLore(id).hasCar, true, `${id} has a car`);
});

test('preferences reflect personalities', () => {
  assert.ok(LORE.jordan.preferredLocations.includes('golf_course'));
  assert.ok(LORE.jordan.preferredLocations.includes('sports_game'));
  assert.ok(LORE.serena.preferredLocations.includes('concert'));
  assert.ok(LORE.riot.preferredLocations.includes('concert'));
  // Iris (mature) avoids loud/chaotic venues.
  for (const loud of ['concert', 'sports_game', 'arcade', 'amusement_park']) {
    assert.ok(!LORE.iris.preferredLocations.includes(loud), `iris avoids ${loud}`);
  }
});

test('formatCharacterFactsBlock states car status', () => {
  assert.ok(formatCharacterFactsBlock(getLore('serena')).includes('do NOT have a car'));
  assert.ok(formatCharacterFactsBlock(getLore('madison')).includes('have your own car'));
});

test('coerceDateLocation accepts new venues, rejects homes/junk', () => {
  assert.equal(coerceDateLocation('concert'), 'concert');
  assert.equal(coerceDateLocation('golf_course'), 'golf_course');
  assert.equal(coerceDateLocation('user_home'), 'coffee_shop'); // homes aren't dateable
  assert.equal(coerceDateLocation('nonsense'), 'coffee_shop');
});
