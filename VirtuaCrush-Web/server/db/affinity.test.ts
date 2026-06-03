// Unit tests for user-message affinity scoring.
// Policy: affinity only drops on explicit abuse/vulgarity; all normal small
// talk earns the base increment, and noisy classifier scores can't punish it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heuristicHostility,
  getAffinityDeltaFromUserMessage,
  AFFINITY_PER_MESSAGE,
  MAX_ABUSE_PENALTY,
  PENALTY_FLOOR,
  CLASSIFIER_CONFIDENCE,
} from './affinity';

// --- heuristic ---------------------------------------------------------------

test('heuristicHostility: normal small talk scores 0', () => {
  assert.equal(heuristicHostility("that's cool I love dragons"), 0);
  assert.equal(heuristicHostility('how was your day?'), 0);
  assert.equal(heuristicHostility('I feel sad and lonely today'), 0);
  assert.equal(heuristicHostility(''), 0);
});

test('heuristicHostility: word-boundary matching avoids false positives (regression)', () => {
  // "indie" must not match "die"; "grape" must not match "rape";
  // "Scunthorpe" must not match "cunt"; "therapist" must not match "rapist".
  assert.equal(heuristicHostility('I love indie music'), 0);
  assert.equal(heuristicHostility('grape soda is the best'), 0);
  assert.equal(heuristicHostility('I grew up near Scunthorpe'), 0);
  assert.equal(heuristicHostility('she is a therapist'), 0);
  assert.equal(heuristicHostility('my phone died earlier'), 0);
  assert.equal(heuristicHostility('we studied all night'), 0);
});

test('heuristicHostility: severe abuse scores 1', () => {
  assert.equal(heuristicHostility('just kys already'), 1);
  assert.equal(heuristicHostility('you CUNT'), 1);
  assert.equal(heuristicHostility('kill yourself'), 1);
});

test('heuristicHostility: directed insults score 0.7', () => {
  assert.equal(heuristicHostility('you are an idiot'), 0.7);
  assert.equal(heuristicHostility("you're so stupid"), 0.7);
});

test('heuristicHostility: casual profanity is NOT penalized', () => {
  // Standalone swearing in conversation should read as normal chat (0).
  assert.equal(heuristicHostility('this is fucking awesome'), 0);
  assert.equal(heuristicHostility('oh shit, that is wild'), 0);
  assert.equal(heuristicHostility('damn that movie was good'), 0);
  assert.equal(heuristicHostility('holy crap'), 0);
  // Flirty/affectionate phrasing that happens to contain a swear must stay 0.
  assert.equal(heuristicHostility("damn you're cute"), 0);
  assert.equal(heuristicHostility("you're the best"), 0);
  assert.equal(heuristicHostility('she is a therapist who loves grapes'), 0);
});

test('heuristicHostility: vulgarity DIRECTED at the character scores 0.8', () => {
  assert.equal(heuristicHostility('fuck you'), 0.8);
  assert.equal(heuristicHostility('fuck off'), 0.8);
  assert.equal(heuristicHostility('you fucking bitch'), 0.8);
  assert.equal(heuristicHostility('go fuck yourself'), 0.8);
  assert.equal(heuristicHostility('you piece of shit'), 0.8);
  assert.equal(heuristicHostility('shut the fuck up'), 0.8);
});

// --- delta -------------------------------------------------------------------

test('normal messages always earn the base increment', () => {
  assert.equal(getAffinityDeltaFromUserMessage("that's cool I love dragons"), AFFINITY_PER_MESSAGE);
  assert.equal(getAffinityDeltaFromUserMessage('I love indie music'), AFFINITY_PER_MESSAGE);
});

test('casual profanity is not penalized (only directed vulgarity is)', () => {
  assert.equal(getAffinityDeltaFromUserMessage('this is fucking awesome', null), AFFINITY_PER_MESSAGE);
  assert.equal(getAffinityDeltaFromUserMessage('oh shit that is wild', null), AFFINITY_PER_MESSAGE);
  assert.ok(getAffinityDeltaFromUserMessage('fuck you', null) < 0);
});

test('noisy mid-range classifier never punishes benign small talk (the reported bug)', () => {
  // The classifier returning 0.3–0.84 on benign text must NOT cause a drop.
  for (const c of [0.3, 0.5, 0.7, 0.84]) {
    assert.equal(
      getAffinityDeltaFromUserMessage("that's cool I love dragons", c),
      AFFINITY_PER_MESSAGE,
      `classifier ${c} should not penalize benign text`,
    );
  }
});

test('classifier only counts as a penalty at high confidence', () => {
  // Below the confidence floor: ignored -> increment.
  assert.equal(getAffinityDeltaFromUserMessage('plain text', CLASSIFIER_CONFIDENCE - 0.01), AFFINITY_PER_MESSAGE);
  // At/above: it can back-stop obfuscated abuse the wordlist missed.
  assert.ok(getAffinityDeltaFromUserMessage('plain text', 0.95) < 0);
});

test('explicit abuse is penalized; worst case hits the max penalty', () => {
  assert.equal(getAffinityDeltaFromUserMessage('kys', null), -MAX_ABUSE_PENALTY);
  assert.equal(getAffinityDeltaFromUserMessage('kys', 1), -MAX_ABUSE_PENALTY);
});

test('heuristic penalizes even when the classifier is unavailable', () => {
  assert.ok(getAffinityDeltaFromUserMessage('you are worthless', null) < 0);
  assert.ok(getAffinityDeltaFromUserMessage('fuck you', null) < 0);
});

test('penalty severity orders insult < directed-vulgar < severe', () => {
  const insult = getAffinityDeltaFromUserMessage('you are an idiot', null); // 0.7
  const vulgar = getAffinityDeltaFromUserMessage('fuck you', null);         // 0.8
  const severe = getAffinityDeltaFromUserMessage('kys', null);             // 1.0
  assert.ok(insult < 0 && vulgar < 0 && severe < 0);
  assert.ok(severe < vulgar, 'severe should be a larger penalty than directed vulgarity');
  assert.ok(vulgar < insult, 'directed vulgarity should be a larger penalty than an insult');
});

test('out-of-range classifier scores are clamped', () => {
  assert.equal(getAffinityDeltaFromUserMessage('plain', 5), -MAX_ABUSE_PENALTY); // >1 -> 1
  assert.equal(getAffinityDeltaFromUserMessage('plain', -3), AFFINITY_PER_MESSAGE); // <0 -> 0
});

test('PENALTY_FLOOR / CLASSIFIER_CONFIDENCE are sane', () => {
  assert.ok(PENALTY_FLOOR > 0 && PENALTY_FLOOR < 1);
  assert.ok(CLASSIFIER_CONFIDENCE > PENALTY_FLOOR);
});
