import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksDegenerate } from './quality';

const SALAD =
  'заеней Leaf Galles replied „Go as parameters setup(mock/Sortal/exolid/L voice/ energy call LU Бе şirk dém as a ' +
  '"../ Millionen" Namen " " as потhnlichData emples вся Baby vari الن among Compétrav Bain cooperativeotteopold ' +
  'raison set downstairs in manoventure вперgonban عملpic � وانت المؤسسات set ahmen tox Mugh droit"\\.UI] jurisd ' +
  'calmer natural cañnectorließen. rotates pierre cultural}w játékfedwithin católicos inhibits Downloads lifespan';

test('looksDegenerate: flags real-world token salad', () => {
  assert.equal(looksDegenerate(SALAD), true);
});

test('looksDegenerate: flags replacement characters and empty output', () => {
  assert.equal(looksDegenerate('hey there �� what'), true);
  assert.equal(looksDegenerate(''), true);
  assert.equal(looksDegenerate('   '), true);
});

test('looksDegenerate: passes normal roleplay replies', () => {
  assert.equal(
    looksDegenerate(
      "*tucks a strand of hair back* Okay okay, you got me — I was totally about to text you first. " +
        "Rachel says hi, by the way. She's been camped on my couch for an hour 🙄 What are you up to tonight?",
    ),
    false,
  );
  assert.equal(looksDegenerate('[NARRATOR] Rain taps the window. Becca curls deeper into the couch.'), false);
  assert.equal(looksDegenerate("It's a date 🎢 can't wait!! 😏💕"), false);
  assert.equal(looksDegenerate('café, fiancée, jalapeño — touché my friend'), false);
});
