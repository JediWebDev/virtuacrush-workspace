import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPlanCue,
  detectAgreedVenue,
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

test('shouldOfferDateChoice: lull fallback needs drive pressure', () => {
  assert.equal(
    shouldOfferDateChoice({ userMsgCount: 20, msgsSinceLastChoice: CHOICE_MAX_GAP, hadPriorChoice: true, cue: false, drivePressure: true }),
    true,
  );
  // No surfaced drive: a cue-less lull never forces a card (no more random offers).
  assert.equal(
    shouldOfferDateChoice({ userMsgCount: 20, msgsSinceLastChoice: CHOICE_MAX_GAP, hadPriorChoice: true, cue: false }),
    false,
  );
  assert.equal(
    shouldOfferDateChoice({ userMsgCount: 12, msgsSinceLastChoice: CHOICE_MAX_GAP - 1, hadPriorChoice: true, cue: false, drivePressure: true }),
    false,
  );
});

test('detectAgreedVenue: venue + commitment in either direction', () => {
  assert.equal(detectAgreedVenue("wanna grab coffee tomorrow?", "yes!! let's do it, I know a place"), 'coffee_shop');
  assert.equal(detectAgreedVenue("ok deal", "the arcade it is — see you there at 7 😏"), 'arcade');
  assert.equal(detectAgreedVenue("sounds great", "come over, we can watch something at my place"), 'character_home');
  assert.equal(detectAgreedVenue("let's hit the theme park saturday", "it's a date 🎢"), 'amusement_park');
});

test('detectAgreedVenue: no commitment or no venue -> null', () => {
  assert.equal(detectAgreedVenue('i had coffee this morning', 'oh nice, how was it?'), null);
  assert.equal(detectAgreedVenue("we should hang out sometime", 'haha maybe!'), null);
  assert.equal(detectAgreedVenue('sounds good', 'glad you liked the song!'), null);
});

test('detectAgreedVenue: venue must live in a plan-flavored message, not just nearby', () => {
  // Agreement in one message + an incidental venue word in the other: no plan.
  assert.equal(detectAgreedVenue('sounds good', 'the park was so crowded in my dream lol'), null);
  assert.equal(detectAgreedVenue('ok deal', 'my sister works at a restaurant downtown'), null);
});

test('detectAgreedVenue: reminiscing about a venue is not a plan', () => {
  assert.equal(detectAgreedVenue("yes!! that was amazing", 'remember when we went to the arcade last week?'), null);
  assert.equal(detectAgreedVenue('i was at the mall yesterday, it sounds good though', 'haha nice'), null);
});
