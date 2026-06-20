import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng } from './scene_registry';
import {
  planDisruptions,
  nextDueDisruption,
  renderDisruptionDirective,
  disruptionResidue,
  disruptionSpec,
} from './interruptions';

const OPTS = { phase: 'home' as const, hasFriend: false, firstMeeting: false };

test('planDisruptions: deterministic for a seed; substantive events only', () => {
  const a = planDisruptions(rng(42), OPTS);
  const b = planDisruptions(rng(42), OPTS);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 1);
  assert.ok(a.every((d) => d.kind === 'npc_event' || d.kind === 'disaster'));
  for (let i = 1; i < a.length; i++) assert.ok(a[i].atTurn >= a[i - 1].atTurn);
});

test('planDisruptions: first meetings get no pre-rolled chaos', () => {
  const plan = planDisruptions(rng(7), { ...OPTS, firstMeeting: true });
  assert.equal(plan.length, 0);
});

test('planDisruptions: friend events only when the friend is present', () => {
  for (let s = 0; s < 20; s++) {
    const without = planDisruptions(rng(s), OPTS);
    assert.ok(!without.some((d) => d.poolId === 'friend_crash_in'));
  }
  let sawFriend = false;
  for (let s = 0; s < 30 && !sawFriend; s++) {
    const withFriend = planDisruptions(rng(s), { ...OPTS, hasFriend: true });
    sawFriend = withFriend.some((d) => d.poolId === 'friend_crash_in' || d.poolId === 'friend_demands_answer');
  }
  assert.ok(sawFriend, 'expected a friend chaos event within 30 seeds');
});

test('nextDueDisruption: respects turn + fired list, lowest turn first', () => {
  const comp = {
    disruptions: [
      { id: 'd1', poolId: 'power_outage', kind: 'disaster' as const, atTurn: 4 },
      { id: 'd2', poolId: 'fire_alarm', kind: 'disaster' as const, atTurn: 8 },
    ],
    firedDisruptions: [] as string[],
  };
  assert.equal(nextDueDisruption(comp, 3), null);
  assert.equal(nextDueDisruption(comp, 5)!.id, 'd1');
  assert.equal(nextDueDisruption({ ...comp, firedDisruptions: ['d1'] }, 9)!.id, 'd2');
  assert.equal(nextDueDisruption({ ...comp, firedDisruptions: ['d1', 'd2'] }, 20), null);
});

test('directive carries mandatory rules; disasters leave residue', () => {
  const beat = { id: 'x', poolId: 'fire_alarm', kind: 'disaster' as const, atTurn: 8 };
  const dir = renderDisruptionDirective(beat, 'Serena', 'serena');
  assert.ok(dir.includes('CHAOS EVENT'));
  assert.ok(dir.includes('MANDATORY'));
  assert.ok(disruptionResidue(beat, 'Serena', 'serena').length > 10);
});

test('friend events render the canonical friend name', () => {
  const beat = { id: 'z', poolId: 'friend_crash_in', kind: 'npc_event' as const, atTurn: 8 };
  const dir = renderDisruptionDirective(beat, 'Serena', 'serena');
  assert.ok(/[A-Z][a-z]+/.test(dir));
  const residue = disruptionResidue(beat, 'Serena', 'serena');
  assert.ok(residue.includes('barged'));
});

test('disruption directives use character pronouns (male characters)', () => {
  const beat = { id: 'm', poolId: 'power_outage', kind: 'disaster' as const, atTurn: 8 };
  const dir = renderDisruptionDirective(beat, 'Ash', 'ash');
  assert.ok(dir.includes('He MUST'), dir);
  assert.ok(!dir.includes('She MUST'), dir);
});

test('no legacy texture or phone ping pools remain', () => {
  assert.equal(disruptionSpec('notification_swipe'), null);
  assert.equal(disruptionSpec('mom_call'), null);
  assert.equal(disruptionSpec('work_ping'), null);
});
