import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVenueSlug } from '../inworld/locations';
import {
  buildEngineSceneDelta,
  extractSceneDeltaFromMessage,
  extractSceneDeltaFromIntent,
  reapplyEngineLocks,
} from './scene_delta';
import { emptySceneSnapshot } from '../inworld/scene_snapshot';

test('resolveVenueSlug: mall keyword → westside_commons', () => {
  assert.equal(resolveVenueSlug('the mall'), 'westside_commons');
  assert.equal(resolveVenueSlug('westside_commons'), 'westside_commons');
});

test('resolveVenueSlug: home variants', () => {
  assert.equal(resolveVenueSlug('home'), 'player_home');
  assert.equal(resolveVenueSlug('my place'), 'player_home');
});

test('resolveVenueSlug: unknown place returns null', () => {
  assert.equal(resolveVenueSlug('abandoned warehouse'), null);
});

test('extractSceneDeltaFromMessage: travel phrase resolves venue', () => {
  const d = extractSceneDeltaFromMessage("let's go to the mall", null);
  assert.equal(d.venueSlug, 'westside_commons');
  assert.equal(d.coPresent, true);
  assert.ok(d.location?.includes('Commons') || d.location?.includes('Mall'));
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
    { type: 'movement', subtype: 'go', target: 'the_grind' },
    {} as never,
  );
  assert.equal(d.venueSlug, 'the_grind');
  assert.equal(d.coPresent, true);
});

test('buildEngineSceneDelta: heuristic mobility + intent location', () => {
  const delta = buildEngineSceneDelta({
    message: "*slip out of the cuffs* let's hit the mall",
    intent: { type: 'movement', subtype: 'go', target: 'westside_commons' },
    prior: emptySceneSnapshot(),
    world: {} as never,
  });
  assert.ok(delta);
  assert.equal(delta!.patch.playerMobility, 'free');
  assert.equal(delta!.venueSlug, 'westside_commons');
  assert.ok(delta!.lockedFields.includes('playerMobility'));
  assert.ok(delta!.lockedFields.includes('location'));
});

test('buildEngineSceneDelta: skips location when allowLocationChange false', () => {
  const delta = buildEngineSceneDelta({
    message: "let's go to the mall",
    intent: { type: 'movement', subtype: 'go', target: 'westside_commons' },
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
    intent: { type: 'movement', subtype: 'go', target: 'westside_commons' },
    prior,
    world: {} as never,
  })!;
  const afterDirector = { ...prior, location: 'Old Place' };
  const locked = reapplyEngineLocks(afterDirector, delta);
  assert.ok(locked.location?.includes('Commons') || locked.location?.includes('Mall'));
});
