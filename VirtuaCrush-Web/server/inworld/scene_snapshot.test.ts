import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialSceneSnapshot,
  mergeSceneSnapshot,
  parseSceneSnapshotPatch,
  snapshotToSceneState,
  emptySceneSnapshot,
} from './scene_snapshot';

test('mergeSceneSnapshot: player restraint persists until cleared', () => {
  const prior = buildInitialSceneSnapshot({
    setting: 'warehouse',
    situation: 'You were grabbed.',
    coPresent: true,
    presentCharacters: [{ name: 'you', role: 'player' }, { name: 'Lexi', role: 'companion' }],
  });
  prior.player.mobility = 'restrained';
  prior.player.voice = 'gagged';

  const merged = mergeSceneSnapshot(prior, { location: 'warehouse back room' }, { narratorTexts: [] });
  assert.equal(merged.player.mobility, 'restrained');
  assert.equal(merged.player.voice, 'gagged');
  assert.equal(merged.location, 'warehouse back room');
});

test('mergeSceneSnapshot: narrator can clear restraint', () => {
  const prior = emptySceneSnapshot();
  prior.player.mobility = 'restrained';
  const merged = mergeSceneSnapshot(
    prior,
    {},
    { narratorTexts: ['You wriggle free and your wrists are finally loose.'] },
  );
  assert.equal(merged.player.mobility, 'free');
});

test('mergeSceneSnapshot: explicit patch updates mobility', () => {
  const prior = emptySceneSnapshot();
  prior.player.mobility = 'restrained';
  const merged = mergeSceneSnapshot(prior, { playerMobility: 'free' }, {});
  assert.equal(merged.player.mobility, 'free');
});

test('parseSceneSnapshotPatch: reads partial director update', () => {
  const p = parseSceneSnapshotPatch({
    present: ['you', 'Serena'],
    playerMobility: 'restrained',
    addThreads: ['Urik is watching from the bar'],
  });
  assert.ok(p);
  assert.deepEqual(p!.present, ['you', 'Serena']);
  assert.equal(p!.playerMobility, 'restrained');
});

test('snapshotToSceneState includes player condition', () => {
  const snap = emptySceneSnapshot();
  snap.location = 'alley';
  snap.player.mobility = 'restrained';
  const prose = snapshotToSceneState(snap);
  assert.match(prose, /mobility: restrained/);
});
