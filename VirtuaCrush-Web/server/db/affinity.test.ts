// Unit tests for user-message affinity scoring.
// Run with: npm run test  (uses node's built-in runner via tsx)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heuristicHostility,
  getAffinityDeltaFromUserMessage,
  AFFINITY_PER_MESSAGE,
  MAX_ABUSE_PENALTY,
  HOSTILITY_THRESHOLD,
} from './affinity';

test('heuristicHostility: normal message scores 0', () => {
  assert.equal(heuristicHostility('hey, how was your day?'), 0);
  assert.equal(heuristicHostility(''), 0);
  assert.equal(heuristicHostility('I feel really sad and lonely today'), 0);
});

test('heuristicHostility: strong abuse term scores 1', () => {
  assert.equal(heuristicHostility('just kys already'), 1);
  assert.equal(heuristicHostility('YOU CUNT'), 1);
});

test('heuristicHostility: directed insult scores 0.7', () => {
  assert.equal(heuristicHostility('you are an idiot'), 0.7);
  assert.equal(heuristicHostility("you're so stupid"), 0.7);
});

test('normal message earns the base increment', () => {
  assert.equal(getAffinityDeltaFromUserMessage('thanks, that helped!'), AFFINITY_PER_MESSAGE);
});

test('classifier null (unavailable) falls back to heuristic alone', () => {
  // Benign text + no classifier => base increment.
  assert.equal(getAffinityDeltaFromUserMessage('good morning', null), AFFINITY_PER_MESSAGE);
  // Heuristic still fires even without the classifier.
  assert.ok(getAffinityDeltaFromUserMessage('kys', null) < 0);
});

test('worst messages incur the maximum penalty', () => {
  // Heuristic hostility = 1 maps to exactly -MAX_ABUSE_PENALTY.
  assert.equal(getAffinityDeltaFromUserMessage('kys', 1), -MAX_ABUSE_PENALTY);
});

test('combined score takes the max of heuristic and classifier', () => {
  // Benign-looking text the heuristic misses, but the classifier flags hard.
  const delta = getAffinityDeltaFromUserMessage('i hope your code never compiles, ever', 0.9);
  assert.ok(delta < 0, 'classifier should drive a penalty');

  // Heuristic catches it even when the classifier under-rates it.
  const delta2 = getAffinityDeltaFromUserMessage('you are worthless', 0.0);
  assert.ok(delta2 < 0, 'heuristic should drive a penalty');
});

test('hostility just below threshold still earns the increment', () => {
  const justUnder = HOSTILITY_THRESHOLD - 0.01;
  assert.equal(getAffinityDeltaFromUserMessage('meh, whatever', justUnder), AFFINITY_PER_MESSAGE);
});

test('penalty scales monotonically with hostility', () => {
  const mild = getAffinityDeltaFromUserMessage('plain text', 0.4);
  const severe = getAffinityDeltaFromUserMessage('plain text', 0.95);
  assert.ok(mild < 0 && severe < 0);
  assert.ok(severe < mild, 'higher hostility should be a larger (more negative) penalty');
});

test('out-of-range classifier scores are clamped', () => {
  // >1 clamps to 1 (max penalty), <0 clamps to 0 (benign => increment).
  assert.equal(getAffinityDeltaFromUserMessage('plain', 5), -MAX_ABUSE_PENALTY);
  assert.equal(getAffinityDeltaFromUserMessage('plain', -3), AFFINITY_PER_MESSAGE);
});
