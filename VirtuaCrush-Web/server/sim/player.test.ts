import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyProfile, learnAboutPlayer, knownPlayerProfile, describeKnownPlayer, detectSharedFacts, observePlayer } from './player';
import type { NpcEntity, PlayerProfile } from './world';

function npc(knownPlayerFacts: string[]): NpcEntity {
  return {
    id: 'x', name: 'X', role: 'npc', location: 'mall', currentActivity: '', mood: 'calm',
    appearance: {}, presentation: { wornItemIds: [], grooming: {} }, inventory: [], fashionPrefs: [],
    needs: {}, goals: [], relationships: {},
    knowledge: { knownLocations: [], beliefs: {}, knownPlayerFacts, lastSeenOutfit: {}, rumors: [] },
    memories: [], schedule: [], faction: null, economy: { money: 0, reputation: {} },
  };
}
const profile: PlayerProfile = {
  displayName: 'Andrew',
  appearance: { hair: 'silver', eyes: 'grey', build: 'lean' },
  biography: { interests: ['synthwave'], hobbies: ['skating'], goals: ['open a bar'], fears: ['heights'], values: ['loyalty'] },
};

test('emptyProfile: blank but well-formed', () => {
  const p = emptyProfile('You');
  assert.equal(p.displayName, 'You');
  assert.deepEqual(p.biography.interests, []);
});

test('a stranger NPC knows nothing -> empty projection + empty description', () => {
  const stranger = npc([]);
  assert.deepEqual(knownPlayerProfile(profile, stranger), {});
  assert.equal(describeKnownPlayer(profile, stranger), '');
});

test('appearance is known only after meeting; bio only after sharing', () => {
  const met = npc(learnAboutPlayer([], ['name', 'appearance']));
  const view = knownPlayerProfile(profile, met);
  assert.equal(view.displayName, 'Andrew');
  assert.equal(view.appearance?.hair, 'silver');
  assert.equal(view.biography, undefined); // bio not shared yet
  const desc = describeKnownPlayer(profile, met);
  assert.ok(desc.includes('silver hair'));
  assert.ok(!desc.toLowerCase().includes('synthwave'));
});

test('learning bio facts surfaces them; others stay hidden', () => {
  const confidant = npc(['name', 'interests', 'fears']);
  const view = knownPlayerProfile(profile, confidant);
  assert.deepEqual(view.biography?.interests, ['synthwave']);
  assert.deepEqual(view.biography?.fears, ['heights']);
  assert.deepEqual(view.biography?.values, []); // not learned
  assert.equal(view.appearance, undefined);     // hasn't met in person
});

test('detectSharedFacts: flags bio categories the message references', () => {
  assert.deepEqual(detectSharedFacts('honestly synthwave is my whole personality', profile), ['interests']);
  assert.deepEqual(detectSharedFacts('I want to open a bar someday', profile), ['goals']);
  assert.deepEqual(detectSharedFacts('nice weather huh', profile), []);
});

test('observePlayer: name always learned; appearance only when co-present; bio on share', () => {
  // texting (not co-present), shares an interest -> name + interests, NOT appearance
  const texting = observePlayer({ coPresent: false, message: 'I love synthwave', profile, existingFacts: [] });
  assert.ok(texting.includes('name'));
  assert.ok(texting.includes('interests'));
  assert.ok(!texting.includes('appearance'));
  // on a date -> appearance becomes known
  const onDate = observePlayer({ coPresent: true, message: 'hi', profile, existingFacts: [] });
  assert.ok(onDate.includes('appearance'));
  // merges with prior knowledge, no duplicates
  const merged = observePlayer({ coPresent: false, message: 'I love skating on weekends', profile, existingFacts: ['name', 'appearance'] });
  assert.equal(new Set(merged).size, merged.length);
  assert.ok(merged.includes('hobbies'));
});

