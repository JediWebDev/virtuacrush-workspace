import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVenueSlug } from '../inworld/locations';
import {
  buildEngineSceneDelta,
  extractSceneDeltaFromMessage,
  extractSceneDeltaFromIntent,
  extractSceneDeltaFromSceneHints,
  reapplyEngineLocks,
} from './scene_delta';
import { emptySceneSnapshot } from '../inworld/scene_snapshot';

test('resolveVenueSlug: mall keyword → mall', () => {
  assert.equal(resolveVenueSlug('the mall'), 'mall');
  assert.equal(resolveVenueSlug('mall'), 'mall');
});

test('resolveVenueSlug: home variants', () => {
  assert.equal(resolveVenueSlug('home'), 'player_home');
  assert.equal(resolveVenueSlug('my place'), 'player_home');
});

test('resolveVenueSlug: unknown place returns null', () => {
  assert.equal(resolveVenueSlug('abandoned warehouse'), null);
});

test('extractSceneDeltaFromMessage: duct tape on companion sets companionVoice', () => {
  const d = extractSceneDeltaFromMessage('*I slap duct tape over her mouth.*', null, 'Lexi');
  assert.equal(d.companionVoice, 'gagged');
});

test('extractSceneDeltaFromMessage: "going to take the gag off" is not a location', () => {
  const d = extractSceneDeltaFromMessage(
    "I'm going to take the gag off, you're going to drink some of this, and then I'm going to untie you. Understood?",
    null,
    'Lexi',
  );
  assert.equal(d.location, undefined);
});

test('extractSceneDeltaFromMessage: pull tape off clears companion gag', () => {
  const prior = emptySceneSnapshot();
  prior.companion.voice = 'gagged';
  const d = extractSceneDeltaFromMessage('*pull the tape off slowly*', prior, 'Lexi');
  assert.equal(d.companionVoice, 'free');
});

test('extractSceneDeltaFromMessage: travel phrase resolves venue', () => {
  const d = extractSceneDeltaFromMessage("let's go to the mall", null);
  assert.equal(d.venueSlug, 'mall');
  assert.equal(d.coPresent, true);
  assert.ok(d.location?.includes('Mall'));
});

test('extractSceneDeltaFromMessage: *wriggle free* clears restraint', () => {
  const d = extractSceneDeltaFromMessage('*wriggle free of the cuffs*', null);
  assert.equal(d.playerMobility, 'free');
});

test('extractSceneDeltaFromMessage: heading home clears venue', () => {
  const d = extractSceneDeltaFromMessage("okay I'm heading home", null);
  assert.equal(d.venueSlug, null);
  assert.equal(d.coPresent, false);
});

test('extractSceneDeltaFromIntent: movement leave', () => {
  const d = extractSceneDeltaFromIntent(
    { type: 'movement', subtype: 'leave' },
    {} as never,
  );
  assert.equal(d.venueSlug, null);
  assert.equal(d.coPresent, false);
});

test('extractSceneDeltaFromIntent: movement go with slug target', () => {
  const d = extractSceneDeltaFromIntent(
    { type: 'movement', subtype: 'go', target: 'cafe' },
    {} as never,
  );
  assert.equal(d.venueSlug, 'cafe');
  assert.equal(d.coPresent, true);
});

test('extractSceneDeltaFromSceneHints: declarative captive scene', () => {
  const d = extractSceneDeltaFromSceneHints({
    locationPhrase: 'the basement',
    coPresent: false,
    playerMobility: 'restrained',
    playerNotes: 'tied to a pipe',
  });
  assert.equal(d.location, 'the basement');
  assert.equal(d.coPresent, false);
  assert.equal(d.playerMobility, 'restrained');
  assert.equal(d.playerNotes, 'tied to a pipe');
});

test('buildEngineSceneDelta: referee hints fill gaps heuristics miss', () => {
  const delta = buildEngineSceneDelta({
    message: "I'm tied up in the basement and you can't reach me",
    intent: { type: 'observation', subtype: 'wait' },
    sceneHints: {
      locationPhrase: 'the basement',
      coPresent: false,
      playerMobility: 'restrained',
    },
    prior: emptySceneSnapshot(),
    world: {} as never,
  });
  assert.ok(delta);
  assert.ok(delta!.sources.includes('referee'));
  assert.equal(delta!.patch.location, 'the basement');
  assert.equal(delta!.patch.coPresent, false);
  assert.equal(delta!.patch.playerMobility, 'restrained');
});

test('buildEngineSceneDelta: heuristic mobility + intent location', () => {
  const delta = buildEngineSceneDelta({
    message: "*slip out of the cuffs* let's hit the mall",
    intent: { type: 'movement', subtype: 'go', target: 'mall' },
    prior: emptySceneSnapshot(),
    world: {} as never,
  });
  assert.ok(delta);
  assert.equal(delta!.patch.playerMobility, 'free');
  assert.equal(delta!.venueSlug, 'mall');
  assert.ok(delta!.lockedFields.includes('playerMobility'));
  assert.ok(delta!.lockedFields.includes('location'));
});

test('buildEngineSceneDelta: skips location when allowLocationChange false', () => {
  const delta = buildEngineSceneDelta({
    message: "let's go to the mall",
    intent: { type: 'movement', subtype: 'go', target: 'mall' },
    prior: emptySceneSnapshot(),
    world: {} as never,
    allowLocationChange: false,
  });
  assert.equal(delta, null);
});

test('reapplyEngineLocks: director cannot undo engine location', () => {
  const prior = emptySceneSnapshot();
  prior.location = 'Old Place';
  const delta = buildEngineSceneDelta({
    message: "let's go to the mall",
    intent: { type: 'movement', subtype: 'go', target: 'mall' },
    prior,
    world: {} as never,
  })!;
  const afterDirector = { ...prior, location: 'Old Place' };
  const locked = reapplyEngineLocks(afterDirector, delta);
  assert.ok(locked.location?.includes('Mall'));
});

test('extractSceneDeltaFromMessage: "cut me free" does not clear restraint prematurely', () => {
  const prior = emptySceneSnapshot();
  prior.player.mobility = 'restrained';
  prior.player.voice = 'gagged';
  const d = extractSceneDeltaFromMessage('Mmf! Mmf! *I try saying hurry up and cut me free.*', prior);
  assert.notEqual(d.playerMobility, 'free');
  assert.equal(d.playerVoice, 'gagged');
});

test('extractSceneDeltaFromIntent: ignores schema placeholder target "venue"', () => {
  const d = extractSceneDeltaFromIntent(
    { type: 'movement', subtype: 'go', target: 'venue' },
    {} as never,
  );
  assert.deepEqual(d, {});
});
