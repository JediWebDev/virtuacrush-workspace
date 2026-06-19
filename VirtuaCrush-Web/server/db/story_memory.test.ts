import test from 'node:test';
import assert from 'node:assert/strict';
import { inferDiaryBeatWeight, rankPinnedBeats, STORY_BEAT_WEIGHT } from './story_memory';
import type { StoryBeat } from './story_memory';

test('inferDiaryBeatWeight: high salience beats score higher', () => {
  assert.ok(inferDiaryBeatWeight('You were kidnapped by masked men.') > inferDiaryBeatWeight('You bantered about tacos.'));
});

test('rankPinnedBeats: weight first, then recency', () => {
  const beats: StoryBeat[] = [
    { at: 100, summary: 'old low', weight: 40, source: 'diary' },
    { at: 300, summary: 'recent high', weight: 90, source: 'memorable' },
    { at: 200, summary: 'mid', weight: 70, source: 'diary' },
  ];
  const pinned = rankPinnedBeats(beats, 2);
  assert.equal(pinned[0]!.summary, 'recent high');
  assert.equal(pinned[1]!.summary, 'mid');
});

test('STORY_BEAT_WEIGHT: secret beats outrank disruption', () => {
  assert.ok(STORY_BEAT_WEIGHT.secret > STORY_BEAT_WEIGHT.disruption);
});
