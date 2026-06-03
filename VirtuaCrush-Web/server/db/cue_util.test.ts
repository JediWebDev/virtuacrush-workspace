import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPlanCue,
  shouldOfferDateChoice,
  CHOICE_MIN_GAP,
  CHOICE_MAX_GAP,
} from './cue_util';

test('detectPlanCue: user plan signals', () => {
  assert.equal(detectPlanCue("what should we do tonight?"), true);
  assert.equal(detectPlanCue("wanna grab coffee?"), true);
  assert.equal(detectPlanCue("i'm so bored"), true);
  assert.equal(detectPlanCue("let's go somewhere"), true);
  assert.equal(detectPlanCue("take me out sometime"), true);
});

test('detectPlanCue: assistant proposing an outing', () => {
  assert.equal(detectPlanCue('hmm', 'how about we grab dinner?'), true);
  assert.equal(detectPlanCue('ok', "let's go get coffee"), true);
});

test('detectPlanCue: ordinary chat is not a cue', () => {
  assert.equal(detectPlanCue('i love that band too'), false);
  assert.equal(detectPlanCue('how was your day?', 'it was good, yours?'), false);
  assert.equal(detectPlanCue('that movie was wild'), false);
});

test('shouldOfferDateChoice: early hook before any choice', () => {
  assert.equal(shouldOfferDateChoice({ userMsgCount: 1, msgsSinceLastChoice: 1, hadPriorChoice: false, cue: false }), false);
  assert.equal(shouldOfferDateChoice({ userMsgCount: 2, msgsSinceLastChoice: 2, hadPriorChoice: false, cue: false }), true);
});

test('shouldOfferDateChoice: cooldown blocks back-to-back', () => {
  assert.equal(
    shouldOfferDateChoice({ userMsgCount: 5, msgsSinceLastChoice: CHOICE_MIN_GAP - 1, hadPriorChoice: true, cue: true }),
    false,
  );
});

test('shouldOfferDateChoice: cue fires after cooldown', () => {
  assert.equal(
    shouldOfferDateChoice({ userMsgCount: 8, msgsSinceLastChoice: CHOICE_MIN_GAP, hadPriorChoice: true, cue: true }),
    true,
  );
});

test('shouldOfferDateChoice: lull fallback fires without a cue', () => {
  assert.equal(
    shouldOfferDateChoice({ userMsgCount: 20, msgsSinceLastChoice: CHOICE_MAX_GAP, hadPriorChoice: true, cue: false }),
    true,
  );
  assert.equal(
    shouldOfferDateChoice({ userMsgCount: 12, msgsSinceLastChoice: CHOICE_MAX_GAP - 1, hadPriorChoice: true, cue: false }),
    false,
  );
});
