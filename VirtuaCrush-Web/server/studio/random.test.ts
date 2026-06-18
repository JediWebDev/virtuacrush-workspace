import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomCharacterDraft, randomArcDraft, randomPackDraft } from './random';
import { normalizeVoiceTagsInput } from './schema';

test('randomCharacterDraft returns valid voice tags', () => {
  const d = randomCharacterDraft();
  assert.ok(d.displayName.trim());
  assert.ok(d.core.length >= 20);
  assert.ok(d.meta.voiceTags.length >= 2);
  assert.equal(normalizeVoiceTagsInput(d.tone), d.tone);
});

test('randomArcDraft validates for built-in companion', () => {
  const d = randomArcDraft('mina');
  assert.equal(d.characterId, 'mina');
  assert.ok(d.setting && d.situation && d.npcInstruction && d.completionCriteria);
});

test('randomPackDraft produces valid graph for built-in companion', () => {
  const d = randomPackDraft('becca');
  assert.ok(d.nodes.start);
  assert.ok(d.title && d.situation && d.systemInstruction);
  assert.ok(Object.values(d.nodes).some((n) => n.choices === null));
});

test('normalizeVoiceTagsInput accepts arrays and rejects unknown tags', () => {
  assert.equal(normalizeVoiceTagsInput(['playful', 'bogus', 'warm']), 'playful, warm');
  assert.equal(normalizeVoiceTagsInput('Playful, Warm'), 'playful, warm');
  assert.equal(normalizeVoiceTagsInput('not_a_tag'), null);
});
