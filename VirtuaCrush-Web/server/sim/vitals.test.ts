import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driveDeltasForIntent, applyDriveDeltas, moodShiftForIntent } from './vitals';
import { getDrives, initDrives } from './drives';

const DEFS = getDrives('ash'); // desire + playful + thirst quirk

test('driveDeltasForIntent: flirting raises desire, playful, and the quirk', () => {
  const d = driveDeltasForIntent({ type: 'romance', subtype: 'flirt' }, DEFS);
  assert.ok(d.desire > 0);
  assert.ok(d.playful > 0);
  assert.ok(d.thirst > 0);
});

test('driveDeltasForIntent: conflict drops the meters', () => {
  const d = driveDeltasForIntent({ type: 'conflict', subtype: 'insult' }, DEFS);
  assert.ok(d.desire < 0);
  assert.ok(d.playful < 0);
});

test('driveDeltasForIntent: rejection craters desire', () => {
  const d = driveDeltasForIntent({ type: 'romance', subtype: 'reject' }, DEFS);
  assert.ok(d.desire <= -15);
});

test('driveDeltasForIntent: smalltalk moves nothing', () => {
  const d = driveDeltasForIntent({ type: 'social', subtype: 'smalltalk' }, DEFS);
  assert.deepEqual(d, {});
});

test('applyDriveDeltas: clamps to [0, 100]', () => {
  const values = initDrives(DEFS);
  values.desire = 95;
  const up = applyDriveDeltas(values, DEFS, { desire: 20 });
  assert.equal(up.desire, 100);
  const down = applyDriveDeltas({ ...values, desire: 5 }, DEFS, { desire: -20 });
  assert.equal(down.desire, 0);
});

test('moodShiftForIntent: notable intents shift mood, neutral ones do not', () => {
  assert.equal(typeof moodShiftForIntent({ type: 'conflict', subtype: 'insult' }, 1), 'string');
  assert.equal(typeof moodShiftForIntent({ type: 'romance', subtype: 'confession' }, 1), 'string');
  assert.equal(moodShiftForIntent({ type: 'social', subtype: 'smalltalk' }, 1), null);
  assert.equal(moodShiftForIntent({ type: 'observation', subtype: 'look' }, 1), null);
});
