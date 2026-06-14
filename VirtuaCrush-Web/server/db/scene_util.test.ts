import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSituationBlock,
  scenePhase,
  type SceneState,
} from './scene_util';

const scene: SceneState = { location: null };

test('formatSituationBlock: affinity note included when provided', () => {
  const b = formatSituationBlock({ activity: 'x', mood: 'y' }, { location: null }, 'Mina', 42);
  assert.ok(b.includes('42/100'));
});

test('formatSituationBlock: apart places them at home, remote', () => {
  const b = formatSituationBlock({ activity: 'mixing a demo', mood: 'mellow' }, scene, 'Riot');
  assert.ok(b.includes('mixing a demo'));
  assert.ok(b.toLowerCase().includes('texting'));
});

test('scenePhase: always returns home', () => {
  assert.equal(scenePhase({ location: null }), 'home');
  assert.equal(scenePhase({ location: 'coffee_shop' }), 'home');
});
