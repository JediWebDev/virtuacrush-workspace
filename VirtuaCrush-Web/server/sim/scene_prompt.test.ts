import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeHomeBaselineActivity,
  inferSceneDeltaFromConversation,
  shouldSuppressHomeBaseline,
  reconcileSceneSnapshotForPrompt,
  isCrisisScene,
} from './scene_prompt';
import { buildFreeRoamSceneSnapshot } from '../inworld/scene_snapshot';

test('sanitizeHomeBaselineActivity: shoplifting becomes at-home activity', () => {
  assert.equal(
    sanitizeHomeBaselineActivity('swiping a silk scarf from a department store'),
    'hanging out at home',
  );
  assert.equal(sanitizeHomeBaselineActivity('scrolling on the couch'), 'scrolling on the couch');
});

test('inferSceneDeltaFromConversation: van captivity implies coPresent + location', () => {
  const history = [
    {
      role: 'assistant' as const,
      content:
        "[NARRATOR] Just as you shift your weight to lunge, every light in the cargo bay dies at once — the van's dome light…",
    },
  ];
  const patch = inferSceneDeltaFromConversation(history, 'Mmf. Mmmf.', null);
  assert.equal(patch.coPresent, true);
  assert.match(patch.location ?? '', /van/i);
});

test('shouldSuppressHomeBaseline: true when player is restrained in ongoing scene', () => {
  const prior = buildFreeRoamSceneSnapshot({ companionName: 'Lexi', coPresent: false });
  prior.player.mobility = 'restrained';
  prior.player.voice = 'gagged';
  assert.equal(
    shouldSuppressHomeBaseline({ prior, history: [], message: 'mmf', storyBeats: [] }),
    true,
  );
});

test('reconcileSceneSnapshotForPrompt: coPresent clears stale remote location', () => {
  const prior = buildFreeRoamSceneSnapshot({ companionName: 'Lexi', coPresent: false });
  prior.player.mobility = 'restrained';
  prior.player.voice = 'gagged';
  const history = [
    {
      role: 'assistant' as const,
      content: '[NARRATOR] In the pitch black cargo bay of the van, she presses her shoulder into yours.',
    },
  ];
  const next = reconcileSceneSnapshotForPrompt(prior, history, 'Mmf.');
  assert.equal(next.coPresent, true);
  assert.doesNotMatch(next.location, /\(remote\)/);
  assert.ok(next.present.some((n) => n.toLowerCase() === 'you'));
});

test('isCrisisScene: true when player is restrained', () => {
  const prior = buildFreeRoamSceneSnapshot({ companionName: 'Lexi', coPresent: true });
  prior.player.mobility = 'restrained';
  assert.equal(isCrisisScene(prior, [], 'mmf'), true);
});

test('inferSceneDeltaFromConversation: cab interior from driver seat action', () => {
  const patch = inferSceneDeltaFromConversation(
    [],
    '*I hobble to the drivers side, open the door, get in and close the door.*',
    null,
  );
  assert.match(patch.location ?? '', /cab/i);
});
