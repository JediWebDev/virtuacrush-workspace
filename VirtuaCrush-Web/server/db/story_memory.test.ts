import test from 'node:test';
import assert from 'node:assert/strict';
import { inferDiaryBeatWeight, rankPinnedBeats, STORY_BEAT_WEIGHT, dedupeStoryBeats, sanitizeBeatSummary } from './story_memory';
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

test('dedupeStoryBeats: collapses overlapping kidnapping/rescue beats', () => {
  const beats: StoryBeat[] = [
    { at: 100, summary: 'You were kidnapped and tied up in your kitchen.', weight: 82, source: 'memorable' },
    { at: 110, summary: 'You were kidnapped and tied up in the kitchen.', weight: 80, source: 'memorable' },
    { at: 120, summary: 'Blair rescued Andrew from being bound and gagged.', weight: 78, source: 'memorable' },
  ];
  const deduped = dedupeStoryBeats(beats);
  assert.ok(deduped.length < beats.length);
  assert.match(sanitizeBeatSummary('user:3 paid'), /the player paid/);
});
