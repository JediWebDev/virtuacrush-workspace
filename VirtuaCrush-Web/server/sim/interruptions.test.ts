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

test('planDisruptions: deterministic for a seed; textures + one beat in range', () => {
  const a = planDisruptions(rng(42), OPTS);
  const b = planDisruptions(rng(42), OPTS);
  assert.deepEqual(a, b);
  const beats = a.filter((d) => d.kind === 'beat');
  assert.equal(beats.length, 1);
  assert.ok(beats[0].atTurn >= 7 && beats[0].atTurn <= 12);
  assert.ok(a.filter((d) => d.kind === 'texture').length >= 1);
  // sorted by turn
  for (let i = 1; i < a.length; i++) assert.ok(a[i].atTurn >= a[i - 1].atTurn);
});

test('planDisruptions: first meetings get no beat (texture only)', () => {
  const plan = planDisruptions(rng(7), { ...OPTS, firstMeeting: true });
  assert.equal(plan.filter((d) => d.kind === 'beat').length, 0);
});

test('planDisruptions: friend exit beat only when the friend is present', () => {
  for (let s = 0; s < 20; s++) {
    const without = planDisruptions(rng(s), OPTS);
    assert.ok(!without.some((d) => d.poolId === 'friend_ride_arrives'));
  }
  let sawExit = false;
  for (let s = 0; s < 20 && !sawExit; s++) {
    const withFriend = planDisruptions(rng(s), { ...OPTS, hasFriend: true });
    sawExit = withFriend.some((d) => d.poolId === 'friend_ride_arrives');
  }
  assert.ok(sawExit, 'expected a friend exit beat within 20 seeds');
});

test('planDisruptions: jailed scenes get nothing; on_date pools are venue-appropriate', () => {
  assert.deepEqual(planDisruptions(rng(1), { ...OPTS, phase: 'jailed' }), []);
  const date = planDisruptions(rng(3), { ...OPTS, phase: 'on_date' });
  for (const d of date) {
    const spec = disruptionSpec(d.poolId)!;
    assert.ok(spec.phase === 'any' || spec.phase === 'on_date', `${d.poolId} wrong phase`);
  }
});

test('nextDueDisruption: respects turn + fired list, lowest turn first', () => {
  const comp = {
    disruptions: [
      { id: 'd1', poolId: 'notification_swipe', kind: 'texture' as const, atTurn: 4 },
      { id: 'd2', poolId: 'mom_call', kind: 'beat' as const, atTurn: 8 },
    ],
    firedDisruptions: [] as string[],
  };
  assert.equal(nextDueDisruption(comp, 3), null);
  assert.equal(nextDueDisruption(comp, 5)!.id, 'd1');
  assert.equal(nextDueDisruption({ ...comp, firedDisruptions: ['d1'] }, 9)!.id, 'd2');
  assert.equal(nextDueDisruption({ ...comp, firedDisruptions: ['d1', 'd2'] }, 20), null);
});

test('directive carries engine bounds; beat residue exists, texture residue does not', () => {
  const beat = { id: 'x', poolId: 'mom_call', kind: 'beat' as const, atTurn: 8 };
  const dir = renderDisruptionDirective(beat, 'Serena', 'serena');
  assert.ok(dir.includes('DISRUPTION THIS TURN'));
  assert.ok(dir.includes('Do not resolve'));
  assert.ok(disruptionResidue(beat, 'Serena', 'serena').length > 10);
  const tex = { id: 'y', poolId: 'ambient_sound', kind: 'texture' as const, atTurn: 4 };
  assert.equal(disruptionResidue(tex, 'Serena', 'serena'), '');
});

test('friend beats render the canonical friend name', () => {
  const beat = { id: 'z', poolId: 'friend_text', kind: 'beat' as const, atTurn: 8 };
  const dir = renderDisruptionDirective(beat, 'Serena', 'serena');
  assert.ok(/[A-Z][a-z]+/.test(dir)); // contains a proper name
  const residue = disruptionResidue(beat, 'Serena', 'serena');
  assert.ok(residue.includes('texted'));
});

test('disruption directives use character pronouns (male characters)', () => {
  const beat = { id: 'm', poolId: 'mom_call', kind: 'beat' as const, atTurn: 8 };
  const dir = renderDisruptionDirective(beat, 'Ash', 'ash');
  assert.ok(dir.includes('He stares'), dir);
  assert.ok(!dir.includes('She stares'), dir);
});
