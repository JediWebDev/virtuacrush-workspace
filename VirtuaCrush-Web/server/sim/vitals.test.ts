import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moodShiftForIntent } from './vitals';

test('moodShiftForIntent: notable intents shift mood, neutral ones do not', () => {
  assert.equal(typeof moodShiftForIntent({ type: 'conflict', subtype: 'insult' }, 1), 'string');
  assert.equal(typeof moodShiftForIntent({ type: 'romance', subtype: 'confession' }, 1), 'string');
  assert.equal(moodShiftForIntent({ type: 'social', subtype: 'smalltalk' }, 1), null);
  assert.equal(moodShiftForIntent({ type: 'observation', subtype: 'look' }, 1), null);
});
