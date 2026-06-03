// Unit tests for the pure story-engine helpers (no DB/runtime needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  isStale,
  parseGeneratedState,
  fallbackGeneratedState,
  advanceProgress,
  formatStateBlock,
  MAX_DAILY_GOAL_DELTA,
  MAX_GOAL_PROGRESS,
} from './story_util';

test('clamp bounds values and handles NaN', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
  assert.equal(clamp(NaN, 0, 10, 7), 7);
});

test('isStale: missing or past date is stale; today is fresh', () => {
  assert.equal(isStale(null), true);
  assert.equal(isStale(undefined), true);
  assert.equal(isStale('2020-01-01', '2026-06-02'), true);
  assert.equal(isStale('2026-06-02', '2026-06-02'), false);
  // tolerates timestamp strings
  assert.equal(isStale('2026-06-02T00:00:00.000Z', '2026-06-02'), false);
});

test('parseGeneratedState: clean JSON', () => {
  const r = parseGeneratedState('{"activity":"grinding ranked","mood":"wired","headline":"Ranked grind","goalDelta":8}');
  assert.ok(r);
  assert.equal(r!.activity, 'grinding ranked');
  assert.equal(r!.mood, 'wired');
  assert.equal(r!.headline, 'Ranked grind');
  assert.equal(r!.goalDelta, 8);
});

test('parseGeneratedState: tolerates fences/prose and clamps goalDelta', () => {
  const raw = 'Sure:\n```json\n{"activity":"mixing a demo","goalDelta":999}\n```';
  const r = parseGeneratedState(raw);
  assert.ok(r);
  assert.equal(r!.activity, 'mixing a demo');
  assert.equal(r!.mood, 'focused');           // defaulted
  assert.equal(r!.headline, 'mixing a demo');  // defaults to activity
  assert.equal(r!.goalDelta, MAX_DAILY_GOAL_DELTA); // clamped
});

test('parseGeneratedState: junk or missing activity returns null', () => {
  assert.equal(parseGeneratedState('no json'), null);
  assert.equal(parseGeneratedState('{"mood":"x"}'), null);
  assert.equal(parseGeneratedState('{}'), null);
});

test('fallbackGeneratedState: deterministic per day, no goal progress', () => {
  const seeds = ['a', 'b', 'c'];
  const r1 = fallbackGeneratedState(seeds, '2026-06-02');
  const r2 = fallbackGeneratedState(seeds, '2026-06-02');
  assert.deepEqual(r1, r2);          // stable within a day
  assert.equal(r1.goalDelta, 0);     // never fabricates progress
  assert.ok(seeds.includes(r1.activity));
});

test('fallbackGeneratedState: empty seeds still returns something', () => {
  const r = fallbackGeneratedState([], '2026-06-02');
  assert.ok(r.activity.length > 0);
});

test('advanceProgress: adds delta, clamps to [0,100]', () => {
  assert.equal(advanceProgress(50, 10), 60);
  assert.equal(advanceProgress(95, 10), MAX_GOAL_PROGRESS); // clamped
  assert.equal(advanceProgress(0, 0), 0);
  assert.equal(advanceProgress(-5, 3), 3); // bad prior clamped to 0 first
});

test('formatStateBlock: empty state -> empty string', () => {
  assert.equal(formatStateBlock(null), '');
  assert.equal(formatStateBlock({ activity: '', mood: 'x', headline: '', goalProgress: 0 }), '');
});

test('formatStateBlock: renders activity + mood', () => {
  const block = formatStateBlock({ activity: 'grinding ranked', mood: 'wired', headline: 'h', goalProgress: 10 });
  assert.ok(block.includes('grinding ranked'));
  assert.ok(block.includes('wired'));
  assert.ok(block.toUpperCase().includes('DOING RIGHT NOW'));
});
