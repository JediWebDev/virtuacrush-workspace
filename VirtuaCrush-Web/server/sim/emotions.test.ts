import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initEmotions,
  decayEmotions,
  emotionDeltasForIntent,
  applyEmotionDeltas,
  topEmotions,
  emotionToneBlock,
  pendingEventFromEmotions,
  emotionKeyForDrive,
} from './emotions';

test('initEmotions: per-character bias applies', () => {
  const serena = initEmotions('serena');
  const generic = initEmotions('lin');
  assert.ok(serena.playful > generic.playful);
});

test('flirting raises arousal; insults raise anger and sink happiness', () => {
  const base = initEmotions('becca');
  const flirted = applyEmotionDeltas(base, emotionDeltasForIntent({ type: 'romance', subtype: 'flirt' }));
  assert.ok(flirted.aroused > base.aroused);
  const insulted = applyEmotionDeltas(base, emotionDeltasForIntent({ type: 'conflict', subtype: 'insult' }));
  assert.ok(insulted.angry > base.angry);
  assert.ok(insulted.happy < base.happy);
});

test('victim narration raises fear, not guilt', () => {
  const d = emotionDeltasForIntent({ type: 'observation', subtype: 'share', detail: 'player is the victim of an in-fiction crime' });
  assert.ok((d.scared ?? 0) > 10);
});

test('decay drifts toward the character baseline', () => {
  const hot = { ...initEmotions('becca'), angry: 90 };
  const later = decayEmotions(hot, 'becca', 6);
  assert.ok(later.angry < 90);
  assert.ok(later.angry > initEmotions('becca').angry);
});

test('topEmotions: sorted, capped, floored', () => {
  const s = { ...initEmotions('becca'), angry: 80, amused: 60 };
  const top = topEmotions(s, 3);
  assert.equal(top[0].key, 'angry');
  assert.equal(top.length, 3);
});

test('emotionToneBlock: present when hot, absent when neutral', () => {
  const calm = emotionToneBlock({ ...initEmotions('lin'), happy: 20, playful: 10, amused: 5 }, 'Lin');
  assert.equal(calm, '');
  const hot = emotionToneBlock({ ...initEmotions('lin'), angry: 70 }, 'Lin');
  assert.ok(hot.includes('angry 70'));
  assert.ok(hot.toLowerCase().includes('suggestive, not explicit'));
});

test('event cards fire from emotions and map back', () => {
  const state = { ...initEmotions('becca'), aroused: 90 };
  const card = pendingEventFromEmotions(state, 'becca', 'Becca');
  assert.ok(card);
  assert.equal(card!.drive, 'desire');
  assert.equal(emotionKeyForDrive(card!.drive), 'aroused');
  assert.equal(pendingEventFromEmotions(initEmotions('becca'), 'becca', 'Becca'), null);
});
