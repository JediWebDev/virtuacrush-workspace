import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSituationBlock,
  scenePhase,
  chooseChoiceKind,
  isGoalBeatDue,
  billAffinity,
  CHOICE_BILL_PAY_AFFINITY,
  CHOICE_BILL_LETPAY_AFFINITY,
  type SceneState,
} from './scene_util';

const apart: SceneState = { mode: 'apart', location: null, billPending: false };
const atCoffee: SceneState = { mode: 'together', location: 'coffee_shop', billPending: true };

test('formatSituationBlock: on a date anchors in the venue', () => {
  const b = formatSituationBlock({ activity: 'grinding ranked', mood: 'wired' }, atCoffee, 'Mina');
  assert.ok(b.includes('ON A DATE'));
  assert.ok(b.toLowerCase().includes('coffee shop'));
  assert.ok(!b.includes('grinding ranked')); // solo activity suppressed while together
});

test('formatSituationBlock: planned date -> logistics phase, still apart', () => {
  const planned: SceneState = { mode: 'apart', location: null, billPending: false, plannedLocation: 'restaurant' };
  const b = formatSituationBlock({ activity: 'x', mood: 'y' }, planned, 'Serena');
  assert.ok(b.toLowerCase().includes('agreed to go'));
  assert.ok(b.toLowerCase().includes('not there yet'));
  assert.ok(b.toLowerCase().includes('meet you there'));
});

test('formatSituationBlock: affinity note included when provided', () => {
  const b = formatSituationBlock({ activity: 'x', mood: 'y' }, { mode: 'apart', location: null, billPending: false }, 'Mina', 42);
  assert.ok(b.includes('42/100'));
});

test('formatSituationBlock: apart places them at home, remote', () => {
  const b = formatSituationBlock({ activity: 'mixing a demo', mood: 'mellow' }, apart, 'Riot');
  assert.ok(b.includes('mixing a demo'));
  assert.ok(b.toLowerCase().includes('texting'));
});

test('formatSituationBlock: together but unknown location falls back to apart text', () => {
  const b = formatSituationBlock({ activity: 'x', mood: 'y' }, { mode: 'together', location: 'void', billPending: false }, 'A');
  assert.ok(b.includes('CURRENT SETTING'));
});

test('scenePhase: home / planning / on_date', () => {
  assert.equal(scenePhase({ mode: 'apart', location: null, billPending: false }), 'home');
  assert.equal(scenePhase({ mode: 'apart', location: null, billPending: false, plannedLocation: 'restaurant' }), 'planning');
  assert.equal(scenePhase({ mode: 'together', location: 'restaurant', billPending: true }), 'on_date');
});

test('chooseChoiceKind: bill at a paid venue with pending bill', () => {
  assert.equal(chooseChoiceKind({ mode: 'together', locationKind: 'paid', billPending: true, preferGoal: false }), 'bill');
  // not paid -> date
  assert.equal(chooseChoiceKind({ mode: 'together', locationKind: 'outing', billPending: true, preferGoal: false }), 'date');
  // paid but already settled -> date
  assert.equal(chooseChoiceKind({ mode: 'together', locationKind: 'paid', billPending: false, preferGoal: false }), 'date');
});

test('chooseChoiceKind: goal beat only when apart', () => {
  assert.equal(chooseChoiceKind({ mode: 'apart', locationKind: null, billPending: false, preferGoal: true }), 'goal');
  assert.equal(chooseChoiceKind({ mode: 'together', locationKind: 'outing', billPending: false, preferGoal: true }), 'date');
});

test('isGoalBeatDue: rare cadence', () => {
  assert.equal(isGoalBeatDue(2), false);
  assert.equal(isGoalBeatDue(6), false);
  assert.equal(isGoalBeatDue(10), true);  // k=2
  assert.equal(isGoalBeatDue(22), true);  // k=5
  assert.equal(isGoalBeatDue(7), false);
});

test('billAffinity: paying earns more than letting them pay', () => {
  assert.equal(billAffinity(0), CHOICE_BILL_PAY_AFFINITY);
  assert.equal(billAffinity(1), CHOICE_BILL_LETPAY_AFFINITY);
  assert.ok(billAffinity(0) > billAffinity(1));
});
