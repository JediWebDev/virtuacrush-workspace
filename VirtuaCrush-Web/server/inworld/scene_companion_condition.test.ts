import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCompanionConditionFromMessage,
  inferCompanionConditionFromBeats,
  inferCompanionConditionFromConversation,
  enforceCompanionSpeechConstraints,
  looksMuffledSpeech,
  mergeCompanionConditionPatches,
  finalizeCompanionConditionPatch,
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

test('extractCompanionConditionFromMessage: pull tape off clears gag', () => {
  const prior = emptySceneSnapshot();
  prior.companion.voice = 'gagged';
  prior.companion.mobility = 'restrained';
  const p = extractCompanionConditionFromMessage('*pull the tape off slowly, watching her expression*', 'Lexi', prior);
  assert.equal(p.companionVoice, 'free');
  assert.equal(p.companionMobility, 'restrained');
});

test('extractCompanionConditionFromMessage: peel duct tape off mouth keeps bind', () => {
  const prior = emptySceneSnapshot();
  prior.companion.voice = 'gagged';
  prior.companion.mobility = 'restrained';
  const p = extractCompanionConditionFromMessage(
    "*I peel the duct tape off of Lexi's mouth in one swift motion.*",
    'Lexi',
    prior,
  );
  assert.equal(p.companionVoice, 'free');
  assert.equal(p.companionMobility, 'restrained');
});

test('extractCompanionConditionFromMessage: cut zip ties clears bind only', () => {
  const prior = emptySceneSnapshot();
  prior.companion.voice = 'gagged';
  prior.companion.mobility = 'restrained';
  const p = extractCompanionConditionFromMessage("*cut the zip ties carefully* She's not bolting tonight.", 'Lexi', prior);
  assert.equal(p.companionMobility, 'free');
  assert.equal(p.companionVoice, 'gagged');
});

test('inferCompanionConditionFromConversation: ungag preserves prior restraint', () => {
  const prior = emptySceneSnapshot();
  prior.companion.voice = 'gagged';
  prior.companion.mobility = 'restrained';
  const p = inferCompanionConditionFromConversation(
    [{ role: 'assistant', content: '[LEXI] mmf mmf!' }],
    '*pull the tape off slowly*',
    'Lexi',
    prior,
  );
  assert.equal(p.companionVoice, 'free');
  assert.equal(p.companionMobility, 'restrained');
});

test('finalizeCompanionConditionPatch: voice-only clear keeps bind', () => {
  const prior = emptySceneSnapshot();
  prior.companion.mobility = 'restrained';
  const p = finalizeCompanionConditionPatch(prior, { companionVoice: 'free' });
  assert.equal(p.companionVoice, 'free');
  assert.equal(p.companionMobility, 'restrained');
});

test('mergeSceneSnapshot: narrator ungag does not clear companion bind', () => {
  const prior = emptySceneSnapshot();
  prior.companion.voice = 'gagged';
  prior.companion.mobility = 'restrained';
  const merged = mergeSceneSnapshot(
    prior,
    { companionVoice: 'free' },
    {
      narratorTexts: ['*Andrew peels the duct tape from her mouth; Lexi gasps.*'],
      companionName: 'Lexi',
    },
  );
  assert.equal(merged.companion.voice, 'free');
  assert.equal(merged.companion.mobility, 'restrained');
});

test('mergeCompanionConditionPatches: explicit free beats stale gagged', () => {
  const p = mergeCompanionConditionPatches(
    { companionVoice: 'gagged' },
    { companionVoice: 'free' },
  );
  assert.equal(p.companionVoice, 'free');
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

test('enforceCompanionSpeechConstraints: no-op when companion voice is free', () => {
  const snap = emptySceneSnapshot();
  snap.companion.voice = 'free';
  const out = enforceCompanionSpeechConstraints(
    [{ speaker: 'Lexi', text: 'Finally — you took your sweet time.' }],
    'Lexi',
    snap,
  );
  assert.equal(out[0].text, 'Finally — you took your sweet time.');
});

test('looksMuffledSpeech: recognizes mmf lines', () => {
  assert.equal(looksMuffledSpeech('mmf mmf mmf!'), true);
  assert.equal(looksMuffledSpeech('okay this is not funny'), false);
});
