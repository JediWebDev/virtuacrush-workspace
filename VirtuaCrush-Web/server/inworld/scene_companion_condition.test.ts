import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCompanionConditionFromMessage,
  inferCompanionConditionFromBeats,
  enforceCompanionSpeechConstraints,
  looksMuffledSpeech,
} from './scene_companion_condition';
import { emptySceneSnapshot, mergeSceneSnapshot } from './scene_snapshot';

test('extractCompanionConditionFromMessage: duct tape on mouth gags companion', () => {
  const p = extractCompanionConditionFromMessage(
    '*I slap duct tape over her mouth.*',
    'Lexi',
  );
  assert.equal(p.companionVoice, 'gagged');
});

test('extractCompanionConditionFromMessage: player opening own mouth does not gag companion', () => {
  const p = extractCompanionConditionFromMessage('*I open my mouth slightly, nodding*', 'Lexi');
  assert.equal(p.companionVoice, undefined);
});

test('inferCompanionConditionFromBeats: pinned beat restores gag after history trim', () => {
  const p = inferCompanionConditionFromBeats(
    [{ summary: 'Andrew restrained Lexi with duct tape — she is gagged.' }],
    'Lexi',
  );
  assert.equal(p.companionVoice, 'gagged');
  assert.equal(p.companionMobility, 'restrained');
});

test('mergeSceneSnapshot: companion gag persists until narrator clears', () => {
  const prior = emptySceneSnapshot();
  prior.companion.voice = 'gagged';
  prior.companion.mobility = 'restrained';
  const merged = mergeSceneSnapshot(prior, { location: 'garage' }, { narratorTexts: [] });
  assert.equal(merged.companion.voice, 'gagged');
  assert.equal(merged.companion.mobility, 'restrained');
});

test('enforceCompanionSpeechConstraints: muffles clear companion lines when gagged', () => {
  const snap = emptySceneSnapshot();
  snap.companion.voice = 'gagged';
  const out = enforceCompanionSpeechConstraints(
    [
      { speaker: 'Lexi', text: '...okay, this is NOT funny. Dani, you still got your phone?' },
      { speaker: 'narrator', text: '*lights flicker*' },
    ],
    'Lexi',
    snap,
  );
  assert.equal(out[0].text, 'mmf mmf mmf!');
  assert.equal(out[1].text, '*lights flicker*');
});

test('looksMuffledSpeech: recognizes mmf lines', () => {
  assert.equal(looksMuffledSpeech('mmf mmf mmf!'), true);
  assert.equal(looksMuffledSpeech('okay this is not funny'), false);
});
