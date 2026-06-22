import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialSceneSnapshot,
  mergeSceneSnapshot,
  parseSceneSnapshotPatch,
  snapshotToSceneState,
  emptySceneSnapshot,
  buildFreeRoamSceneSnapshot,
  formatSceneSnapshotBody,
  readSceneSnapshot,
  sanitizeDirectorSnapshotPatch,
} from './scene_snapshot';

test('mergeSceneSnapshot: companion gag persists until cleared', () => {
  const prior = emptySceneSnapshot();
  prior.companion.voice = 'gagged';
  prior.companion.mobility = 'restrained';

  const merged = mergeSceneSnapshot(prior, { venueSlug: 'westside_commons' }, { narratorTexts: [] });
  assert.equal(merged.companion.voice, 'gagged');
  assert.equal(merged.companion.mobility, 'restrained');
  assert.equal(merged.venueSlug, 'westside_commons');
});

test('formatSceneSnapshotBody: includes companion condition line', () => {
  const snap = buildFreeRoamSceneSnapshot({ companionName: 'Lexi', coPresent: true });
  snap.companion.voice = 'gagged';
  snap.companion.mobility = 'restrained';
  const body = formatSceneSnapshotBody(snap);
  assert.match(body, /Companion condition.*gagged/i);
  assert.match(body, /restrained/i);
});

test('mergeSceneSnapshot: player restraint persists until cleared', () => {
  const prior = buildInitialSceneSnapshot({
    setting: 'warehouse',
    situation: 'You were grabbed.',
    coPresent: true,
    presentCharacters: [{ name: 'you', role: 'player' }, { name: 'Lexi', role: 'companion' }],
  });
  prior.player.mobility = 'restrained';
  prior.player.voice = 'gagged';

  const merged = mergeSceneSnapshot(prior, { roomId: 'kitchen' }, { narratorTexts: [] });
  assert.equal(merged.player.mobility, 'restrained');
  assert.equal(merged.player.voice, 'gagged');
  assert.equal(merged.roomId, 'kitchen');
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

test('buildFreeRoamSceneSnapshot: remote omits player from present list', () => {
  const snap = buildFreeRoamSceneSnapshot({
    companionName: 'Blair',
    coPresent: false,
    extraPresent: ['Hana'],
  });
  assert.equal(snap.coPresent, false);
  assert.deepEqual(snap.present, ['Blair', 'Hana']);
  assert.match(snap.location, /Blair's place \(remote\)/);
});

test('formatSceneSnapshotBody: remote wording is not contradictory', () => {
  const snap = buildFreeRoamSceneSnapshot({ companionName: 'Blair', coPresent: false });
  const body = formatSceneSnapshotBody(snap);
  assert.match(body, /remote/);
  assert.doesNotMatch(body, /Present: you, Blair/);
  assert.match(body, /With companion/);
});

test('sanitizeDirectorSnapshotPatch: strips spatial and condition fields', () => {
  const safe = sanitizeDirectorSnapshotPatch({
    location: 'mall',
    venueSlug: 'westside_commons',
    coPresent: true,
    playerMobility: 'restrained',
    companionVoice: 'gagged',
    present: ['you', 'Lexi'],
    addThreads: ['Urik is watching'],
    playerNotes: 'nervous',
  });
  assert.ok(safe);
  assert.deepEqual(safe!.present, ['you', 'Lexi']);
  assert.deepEqual(safe!.addThreads, ['Urik is watching']);
  assert.equal(safe!.playerNotes, 'nervous');
  assert.equal(safe!.location, undefined);
  assert.equal(safe!.playerMobility, undefined);
  assert.equal(safe!.companionVoice, undefined);
});

test('readSceneSnapshot: migrates legacy location to venueSlug', () => {
  const snap = readSceneSnapshot({
    sceneSnapshot: {
      location: 'Westside Commons',
      coPresent: true,
      present: ['you', 'Lexi'],
      player: { mobility: 'free', voice: 'free', notes: '' },
      companion: { mobility: 'free', voice: 'free', notes: '' },
      openThreads: [],
    },
  });
  assert.ok(snap);
  assert.equal(snap!.venueSlug, 'westside_commons');
});

test('readSceneSnapshot: strips player from present when remote', () => {
  const snap = readSceneSnapshot({
    sceneSnapshot: {
      location: 'home',
      coPresent: false,
      present: ['you', 'Blair'],
      player: { mobility: 'free', voice: 'free', notes: '' },
      companion: { mobility: 'free', voice: 'free', notes: '' },
      openThreads: [],
    },
  });
  assert.ok(snap);
  assert.deepEqual(snap!.present, ['Blair']);
});
