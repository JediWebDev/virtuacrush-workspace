import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetArcIdFor } from './meet_arc';

test('meetArcIdFor follows character id convention', () => {
  assert.equal(meetArcIdFor('mina'), 'mina_meet');
});
