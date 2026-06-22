import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySceneSnapshot } from '../inworld/scene_snapshot';
import {
  formatSpatialLocation,
  inferRoomFromMessage,
  resolveSpatialFromInput,
} from './spatial';

test('formatSpatialLocation: player home with room', () => {
  const label = formatSpatialLocation('player_home', 'garage');
  assert.match(label, /garage/i);
});

test('inferRoomFromMessage: garage at player home', () => {
  assert.equal(inferRoomFromMessage('*carry her into the garage*', 'player_home'), 'garage');
});

test('resolveSpatialFromInput: mall travel resolves slug', () => {
  const patch = resolveSpatialFromInput({
    message: "let's go to the mall",
    prior: emptySceneSnapshot(),
    companionName: 'Lexi',
  });
  assert.equal(patch.venueSlug, 'westside_commons');
  assert.equal(patch.coPresent, true);
});

test('resolveSpatialFromInput: gag phrase is not travel', () => {
  const patch = resolveSpatialFromInput({
    message: "I'm going to take the gag off now",
    prior: emptySceneSnapshot(),
    companionName: 'Lexi',
  });
  assert.equal(patch.venueSlug, undefined);
});

test('resolveSpatialFromInput: heading home clears venue', () => {
  const prior = emptySceneSnapshot();
  prior.venueSlug = 'westside_commons';
  const patch = resolveSpatialFromInput({
    message: "I'm heading home",
    prior,
    companionName: 'Lexi',
  });
  assert.equal(patch.venueSlug, null);
  assert.equal(patch.coPresent, false);
});

test('resolveSpatialFromInput: carry into garage sets player_home + room', () => {
  const patch = resolveSpatialFromInput({
    message: '*carry Lexi into the garage*',
    prior: emptySceneSnapshot(),
    companionName: 'Lexi',
  });
  assert.equal(patch.venueSlug, 'player_home');
  assert.equal(patch.roomId, 'garage');
  assert.equal(patch.coPresent, true);
});
