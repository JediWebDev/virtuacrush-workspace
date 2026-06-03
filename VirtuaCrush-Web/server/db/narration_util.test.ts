import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideNarrationMode, formatNarrationDirective } from './narration_util';

test('decideNarrationMode: backhanded/provocative -> narration', () => {
  assert.equal(decideNarrationMode("you're brave to wear such a tight dress in public"), 'narration');
  assert.equal(decideNarrationMode('bold of you to show up here'), 'narration');
  assert.equal(decideNarrationMode("you really think you can beat me?"), 'narration');
  assert.equal(decideNarrationMode('nice try'), 'narration');
});

test('decideNarrationMode: physical/roleplay action -> blend', () => {
  assert.equal(decideNarrationMode('*leans in close*'), 'blend');
  assert.equal(decideNarrationMode('I reach over and hold your hand'), 'blend');
  assert.equal(decideNarrationMode('i hand you a single rose'), 'blend');
});

test('decideNarrationMode: emotional/vulnerable -> blend', () => {
  assert.equal(decideNarrationMode('I think I love you'), 'blend');
  assert.equal(decideNarrationMode("i can't stop thinking about you"), 'blend');
});

test('decideNarrationMode: ordinary chat -> dialogue', () => {
  assert.equal(decideNarrationMode('how was your day?'), 'dialogue');
  assert.equal(decideNarrationMode('I love that band too'), 'dialogue');
  assert.equal(decideNarrationMode(''), 'dialogue');
});

test('formatNarrationDirective: empty for dialogue, convention for others', () => {
  assert.equal(formatNarrationDirective('dialogue', 'Mina'), '');
  const nar = formatNarrationDirective('narration', 'Mina');
  assert.ok(nar.includes('asterisks'));
  assert.ok(nar.toUpperCase().includes('LOOK'));
  assert.ok(nar.includes('Mina'));
  const blend = formatNarrationDirective('blend', 'Mina');
  assert.ok(blend.toLowerCase().includes('blend'));
});
