import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeVictimNarration, vetoVictimCrime } from './victim';

test('victim narration is detected', () => {
  assert.equal(looksLikeVictimNarration('I was kidnapped by masked men and held in an abandoned warehouse'), true);
  assert.equal(looksLikeVictimNarration("they grabbed me and tied me up"), true);
  assert.equal(looksLikeVictimNarration("I'm being held for ransom — they want the book in exchange for me"), true);
  assert.equal(looksLikeVictimNarration('some guy just mugged me outside'), true);
});

test('perpetrator narration is NOT vetoed', () => {
  assert.equal(looksLikeVictimNarration('*I grab the cash register and run*'), false);
  assert.equal(looksLikeVictimNarration('I kidnap the bartender'), false);
  assert.equal(looksLikeVictimNarration("let's rob this place"), false);
  assert.equal(looksLikeVictimNarration('I punch him in the face'), false);
});

test('vetoVictimCrime replaces crime with observation for victims only', () => {
  const crime = { type: 'crime' as const, subtype: 'kidnapping' };
  const vetoed = vetoVictimCrime(crime, 'I was kidnapped by masked men');
  assert.equal(vetoed.type, 'observation');
  const kept = vetoVictimCrime(crime, 'I kidnap the waiter');
  assert.equal(kept.type, 'crime');
  const social = vetoVictimCrime({ type: 'social' as const, subtype: 'share' }, 'I was kidnapped!');
  assert.equal(social.type, 'social');
});
