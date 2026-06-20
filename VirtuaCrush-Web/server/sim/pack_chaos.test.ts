import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferArcTagsFromPack } from './pack_chaos';

describe('pack_chaos', () => {
  it('inferArcTagsFromPack maps mood and tag keywords', () => {
    const tags = inferArcTagsFromPack({
      id: 'test',
      characterId: 'serena',
      title: 'Ghosts',
      blurb: '',
      tags: ['Jealousy', 'Drama'],
      mood: 'tense',
      estimatedMinutes: 20,
      coverGradient: ['#000', '#111'],
      systemInstruction: '',
      nodes: { start: { npcInstruction: 'x', choices: null } },
    });
    assert.ok(tags.includes('jealousy'));
    assert.ok(tags.includes('conflict'));
  });

  it('inferArcTagsFromPack merges explicit arcTags with inferred', () => {
    const tags = inferArcTagsFromPack({
      id: 'test',
      characterId: 'lexi',
      title: 'Heist',
      blurb: '',
      tags: ['Crime'],
      mood: 'dramatic',
      arcTags: ['money', 'chaos'],
      estimatedMinutes: 20,
      coverGradient: ['#000', '#111'],
      systemInstruction: '',
      nodes: { start: { npcInstruction: 'x', choices: null } },
    });
    assert.ok(tags.includes('money'));
    assert.ok(tags.includes('chaos'));
    assert.ok(tags.includes('conflict'));
  });
});
