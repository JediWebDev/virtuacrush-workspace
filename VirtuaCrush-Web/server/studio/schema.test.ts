import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARC_TONES,
  PACK_MOODS,
  VOICE_TAGS,
  NARRATIVE_TAGS,
  parseVoiceTags,
  formatVoiceTags,
  composeVoiceToneBlock,
  fillTemplate,
  isVoiceTag,
  VOICE_TAG_PROMPTS,
} from './schema';
import { COMPANION_ARCHETYPE_TEMPLATES } from './templates/characterArchetypes';
import { ARC_SCENARIO_TEMPLATES } from './templates/arcTemplates';
import { PACK_GRAPH_TEMPLATES, PACK_MOOD_COPY } from './templates/packTemplates';

test('VOICE_TAG_PROMPTS covers every VOICE_TAG', () => {
  for (const tag of VOICE_TAGS) {
    assert.ok(VOICE_TAG_PROMPTS[tag], `missing prompt for ${tag}`);
  }
});

test('companion archetypes use valid voice tags and registered ids', () => {
  for (const t of COMPANION_ARCHETYPE_TEMPLATES) {
    assert.ok(t.voiceTags.length >= 2 && t.voiceTags.length <= 3, `${t.id} tag count`);
    for (const tag of t.voiceTags) assert.ok(isVoiceTag(tag), `${t.id} bad tag ${tag}`);
    assert.match(t.coreTemplate, /\{\{companionName\}\}/, `${t.id} should reference companionName`);
  }
});

test('arc templates use valid tone and narrative tags', () => {
  for (const t of ARC_SCENARIO_TEMPLATES) {
    assert.ok(ARC_TONES.includes(t.tone), `${t.id} tone`);
    for (const tag of t.arcTags) assert.ok(NARRATIVE_TAGS.includes(tag), `${t.id} arcTag ${tag}`);
    assert.ok(t.situationTemplate.trim() && t.npcInstructionTemplate.trim() && t.completionCriteriaTemplate.trim());
  }
});

test('pack graph templates have start node and valid choice targets', () => {
  for (const g of PACK_GRAPH_TEMPLATES) {
    assert.ok(g.nodes.start, `${g.id} missing start`);
    for (const mood of g.moods) assert.ok(PACK_MOODS.includes(mood), `${g.id} mood ${mood}`);
    const ids = new Set(Object.keys(g.nodes));
    for (const [nodeId, node] of Object.entries(g.nodes)) {
      assert.ok(node.npcInstructionTemplate.trim(), `${g.id}/${nodeId} instruction`);
      if (node.terminal) {
        assert.equal(node.choices, undefined);
      } else {
        assert.ok(node.choices?.length, `${g.id}/${nodeId} needs choices`);
        for (const c of node.choices ?? []) {
          assert.ok(c.next === 'end' || ids.has(c.next), `${g.id}/${nodeId} bad next ${c.next}`);
        }
      }
    }
  }
});

test('pack mood copy references real graph ids', () => {
  const graphIds = new Set(PACK_GRAPH_TEMPLATES.map((g) => g.id));
  for (const copy of PACK_MOOD_COPY) {
    assert.ok(graphIds.has(copy.graphId), copy.graphId);
    assert.ok(PACK_MOODS.includes(copy.mood), copy.mood);
  }
});

test('parseVoiceTags normalizes and caps', () => {
  assert.deepEqual(parseVoiceTags('Playful, SASSY, playful, unknown'), ['playful', 'sassy']);
  assert.equal(formatVoiceTags(['warm', 'calm']), 'warm, calm');
});

test('composeVoiceToneBlock includes tag prompts', () => {
  const block = composeVoiceToneBlock(['witty', 'warm']);
  assert.match(block, /VOICE & TONE: witty, warm/);
  assert.match(block, /wordplay/);
});

test('fillTemplate substitutes vars', () => {
  assert.equal(
    fillTemplate('Hello {{companionName}} at {{setting}}', { companionName: 'Mina', setting: 'the pier' }),
    'Hello Mina at the pier',
  );
});
