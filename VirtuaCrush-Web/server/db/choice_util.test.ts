import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGeneratedChoice,
  isChoiceDue,
  effectsForOption,
  isExpired,
  expiryFrom,
  DEFAULT_TIMEOUT_REACTION,
  CHOICE_ADVANCE_AFFINITY,
  CHOICE_ADVANCE_GOAL,
  CHOICE_NEUTRAL_GOAL,
} from './choice_util';

const VALID = JSON.stringify({
  prompt: 'My chorus is stuck — help me pick a vibe?',
  options: [
    { label: 'Go bold and weird', advancesGoal: true, reaction: 'Yes! That cracks it open.', post: 'Cracked the chorus tonight 🎸' },
    { label: 'Keep it mellow', advancesGoal: false, reaction: 'Mellow it is, cozy.' },
  ],
  timeoutReaction: '*sighs and turns back to the guitar*',
});

test('parseGeneratedChoice: valid choice parses', () => {
  const c = parseGeneratedChoice(VALID);
  assert.ok(c);
  assert.equal(c!.options.length, 2);
  assert.equal(c!.options[0].advancesGoal, true);
  assert.equal(c!.options[0].post, 'Cracked the chorus tonight 🎸');
  assert.equal(c!.options[1].advancesGoal, false);
  assert.equal(c!.options[1].post, undefined);
});

test('parseGeneratedChoice: tolerates prose/fences around JSON', () => {
  const c = parseGeneratedChoice('Sure!\n```json\n' + VALID + '\n```');
  assert.ok(c);
  assert.equal(c!.prompt.length > 0, true);
});

test('parseGeneratedChoice: defaults missing timeoutReaction', () => {
  const obj = JSON.parse(VALID);
  delete obj.timeoutReaction;
  const c = parseGeneratedChoice(JSON.stringify(obj));
  assert.equal(c!.timeoutReaction, DEFAULT_TIMEOUT_REACTION);
});

test('parseGeneratedChoice: rejects wrong option count / missing fields / junk', () => {
  assert.equal(parseGeneratedChoice('not json'), null);
  const one = JSON.parse(VALID); one.options = [one.options[0]];
  assert.equal(parseGeneratedChoice(JSON.stringify(one)), null);
  const noLabel = JSON.parse(VALID); noLabel.options[0].label = '';
  assert.equal(parseGeneratedChoice(JSON.stringify(noLabel)), null);
  const noPrompt = JSON.parse(VALID); noPrompt.prompt = '';
  assert.equal(parseGeneratedChoice(JSON.stringify(noPrompt)), null);
});

test('isChoiceDue: early hook then steady cadence', () => {
  assert.equal(isChoiceDue(0), false);
  assert.equal(isChoiceDue(1), false);
  assert.equal(isChoiceDue(2), true);
  assert.equal(isChoiceDue(3), false);
  assert.equal(isChoiceDue(6), true);
  assert.equal(isChoiceDue(10), true);
  assert.equal(isChoiceDue(7), false);
});

test('effectsForOption: advancing vs neutral', () => {
  assert.deepEqual(effectsForOption(true), { affinityDelta: CHOICE_ADVANCE_AFFINITY, goalDelta: CHOICE_ADVANCE_GOAL });
  assert.equal(effectsForOption(false).goalDelta, CHOICE_NEUTRAL_GOAL);
});

test('expiry/isExpired', () => {
  const created = 1_000_000;
  const exp = expiryFrom(created, 60);
  assert.equal(exp, created + 60_000);
  assert.equal(isExpired(exp, created + 59_999), false);
  assert.equal(isExpired(exp, created + 60_000), true);
});
