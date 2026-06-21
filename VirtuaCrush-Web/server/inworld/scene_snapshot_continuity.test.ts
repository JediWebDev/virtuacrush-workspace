import test from 'node:test';
import assert from 'node:assert/strict';
import { applySceneContinuityUpdate, buildInitialSceneSnapshot } from './scene_snapshot';

test('applySceneContinuityUpdate ignores LLM sceneState prose and repairs cast', () => {
  const prior = buildInitialSceneSnapshot({
    setting: 'dungeon',
    situation: 'Testing trust.',
    coPresent: true,
    presentCharacters: [
      { name: 'you', role: 'player' },
      { name: 'Serena', role: 'companion' },
      { name: 'Dana', role: 'npc' },
    ],
  });

  const { snapshot, sceneState } = applySceneContinuityUpdate({
    priorSnapshot: prior,
    sceneSnapshotPatch: { present: ['Dana'] },
    sceneStateProse: 'Location: nowhere. Present: Dana only.',
    narratorTexts: [],
    requiredNames: ['you', 'Serena', 'Dana'],
    coPresentLock: true,
  });

  assert.equal(snapshot.coPresent, true);
  assert.ok(snapshot.present.some((n) => n.toLowerCase() === 'serena'));
  assert.ok(snapshot.present.some((n) => n.toLowerCase() === 'dana'));
  assert.match(sceneState, /Serena/i);
  assert.match(sceneState, /physically together/i);
});
