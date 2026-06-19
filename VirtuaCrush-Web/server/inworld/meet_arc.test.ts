import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEET_AFFINITY_REWARD,
  defaultMeetBadge,
  hasCompletedMeetArc,
  meetArcIdFor,
  meetArcReadyToComplete,
  meetPhaseInstructions,
  resolveMeetCompletionBadge,
} from './meet_arc';
import type { StoryArc } from './arcs';

test('meetArcIdFor follows character id convention', () => {
  assert.equal(meetArcIdFor('mina'), 'mina_meet');
});

test('hasCompletedMeetArc is false until meet arc is in completions', () => {
  const done = new Set<string>();
  assert.equal(hasCompletedMeetArc('mina', done), false);
  done.add('mina_meet');
  assert.equal(hasCompletedMeetArc('mina', done), true);
});

test('hasCompletedMeetArc passes for characters without a built-in meet arc', () => {
  assert.equal(hasCompletedMeetArc('user:abc', new Set()), true);
});

test('meetPhaseInstructions prefixes three acts', () => {
  const p = meetPhaseInstructions({ beginning: 'a', middle: 'b', end: 'c' });
  assert.match(p.beginning!, /BEGINNING/);
  assert.match(p.middle!, /MIDDLE/);
  assert.match(p.end!, /RESOLUTION/);
});

test('resolveMeetCompletionBadge prefers director badge', () => {
  const arc = { characterId: 'mina', isMeetArc: true } as StoryArc;
  const badge = resolveMeetCompletionBadge(arc, { title: 'Custom', description: 'From LLM' });
  assert.deepEqual(badge, { title: 'Custom', description: 'From LLM' });
});

test('resolveMeetCompletionBadge falls back to authored meet badge', () => {
  const arc = { characterId: 'mina', isMeetArc: true } as StoryArc;
  const badge = resolveMeetCompletionBadge(arc, null);
  assert.equal(badge.title, defaultMeetBadge(arc).title);
});

test('MEET_AFFINITY_REWARD is a modest bump', () => {
  assert.ok(MEET_AFFINITY_REWARD >= 2 && MEET_AFFINITY_REWARD <= 6);
});

test('meetArcReadyToComplete: Becca-style transcript lands the meet', () => {
  const recent = [
    "I'm Andrew, by the way.",
    'Becca, but if you call me Rebecca I\'m shelving this wrong.',
    'So I was wondering if you would like to hang out sometime?',
    'Hang out? Outside Video Galaxy?',
    "I give Becca my phone number and add hers to my contacts.",
    "Alright, Andrew. You're officially in my phone. I'll text you when I've picked the film.",
  ].join('\n');
  assert.equal(
    meetArcReadyToComplete({
      userTurnsSinceStart: 8,
      playerDisplayName: 'Andrew',
      companionName: 'Becca',
      recentText: recent,
      currentUserMessage: "I give Becca my phone number and add hers to my contacts.",
    }),
    true,
  );
});

test('meetArcReadyToComplete: too early without connection beat', () => {
  assert.equal(
    meetArcReadyToComplete({
      userTurnsSinceStart: 2,
      playerDisplayName: 'Andrew',
      companionName: 'Becca',
      recentText: 'hi',
      currentUserMessage: 'hello',
    }),
    false,
  );
});
