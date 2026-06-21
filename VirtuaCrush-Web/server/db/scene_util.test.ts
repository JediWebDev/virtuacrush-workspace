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

test('formatSituationBlock: away daily activity is sanitized for at-home baseline', () => {
  const b = formatSituationBlock(
    { activity: 'swiping a silk scarf from a department store', mood: 'prickly' },
    scene,
    'Lexi',
  );
  assert.ok(b.includes('hanging out at home'));
  assert.ok(!b.includes('department store'));
});

test('scenePhase: home when remote, on_date when at a venue', () => {
  assert.equal(scenePhase({ location: null }), 'home');
  assert.equal(scenePhase({ location: 'the_grind' }), 'on_date');
});
