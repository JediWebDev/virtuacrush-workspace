import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLore } from '../inworld/lore';
import {
  isProbing,
  shouldRevealSecret,
  formatPersonaTraitsBlock,
  proneMood,
  desireNudge,
  SECRET_REVEAL_AFFINITY,
} from './traits';

test('isProbing: catches direct secret-seeking and pointed personal questions', () => {
  assert.equal(isProbing('what are you really hiding?'), true);
  assert.equal(isProbing('tell me the truth'), true);
  assert.equal(isProbing('are you actually being honest with me?'), true);
  assert.equal(isProbing('what should we eat tonight?'), false);
  assert.equal(isProbing('lol nice'), false);
});

test('shouldRevealSecret: needs undiscovered + high affinity + probing', () => {
  const base = { discovered: false, message: 'what are you hiding?' };
  assert.equal(shouldRevealSecret({ ...base, affinity: SECRET_REVEAL_AFFINITY }), true);
  assert.equal(shouldRevealSecret({ ...base, affinity: SECRET_REVEAL_AFFINITY - 1 }), false);
  assert.equal(shouldRevealSecret({ ...base, affinity: 90, discovered: true }), false);
  assert.equal(shouldRevealSecret({ affinity: 90, discovered: false, message: 'wanna get boba?' }), false);
});

test('formatPersonaTraitsBlock: hides reveal text while guarding, shows it on reveal', () => {
  const lore = getLore('serena');
  const guarded = formatPersonaTraitsBlock(lore, { discovered: false, revealNow: false });
  assert.ok(!guarded.includes(lore.secret.reveal), 'reveal text must not leak while guarding');
  assert.ok(guarded.includes('guard it'));
  assert.ok(guarded.includes(lore.voice));

  const revealed = formatPersonaTraitsBlock(lore, { discovered: false, revealNow: true });
  assert.ok(revealed.includes(lore.secret.reveal));

  const known = formatPersonaTraitsBlock(lore, { discovered: true, revealNow: false });
  assert.ok(known.includes(lore.secret.reveal));
});

test('proneMood: returns a mood from the proneness pool, deterministic by roll', () => {
  const lore = getLore('serena');
  const pool = lore.moodProneness;
  assert.ok(pool.includes(proneMood(lore, 'neutral', 0)));
  assert.ok(pool.includes(proneMood(lore, 'neutral', 0.99)));
  assert.equal(proneMood(lore, 'neutral', 0), pool[0]);            // roll 0 -> first in pool
  assert.equal(proneMood(lore, 'neutral', 0.5), proneMood(lore, 'neutral', 0.5)); // deterministic
});

test('desireNudge: rewards posting for attention-seekers, calms the home-bodies', () => {
  assert.ok(desireNudge(['attention'], 'post') > 0);
  assert.ok(desireNudge(['stability'], 'move') < 0);
  assert.equal(desireNudge(['connection'], 'bond') > 0, true);
  assert.equal(desireNudge([], 'post'), 0);
});
