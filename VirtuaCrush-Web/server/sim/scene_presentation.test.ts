import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySceneSnapshot } from '../inworld/scene_snapshot';
import { initEmotions } from './emotions';
import { resolvePresentation } from './scene_presentation';
import { backgroundForVenue, portraitKeyForCharacter } from './presentation_catalog';

test('portraitKeyForCharacter: built-in companion', () => {
  assert.equal(portraitKeyForCharacter('mina'), 'characters/Mina_Character.png');
});

test('portraitKeyForCharacter: custom image key wins', () => {
  assert.equal(portraitKeyForCharacter('user:abc', 'user-content/x.png'), 'user-content/x.png');
});

test('backgroundForVenue: remote when no slug', () => {
  const bg = backgroundForVenue(null, null);
  assert.equal(bg.backgroundId, 'remote');
  assert.match(bg.backgroundGradient, /gradient/);
});

test('backgroundForVenue: player home garage room', () => {
  const bg = backgroundForVenue('player_home', 'garage');
  assert.equal(bg.backgroundId, 'player_home:garage');
});

test('resolvePresentation: remote chat mode', () => {
  const snap = emptySceneSnapshot();
  snap.coPresent = false;
  const p = resolvePresentation({
    snapshot: snap,
    characterId: 'lexi',
    companionName: 'Lexi',
    emotions: initEmotions('lexi'),
  });
  assert.equal(p.uiMode, 'chat_remote');
  assert.equal(p.coPresent, false);
  assert.ok(p.overlays.includes('remote_connection'));
  assert.equal(p.actors.find((a) => a.id === 'player')?.visible, false);
});

test('resolvePresentation: co-present with gag is crisis mode', () => {
  const snap = emptySceneSnapshot();
  snap.coPresent = true;
  snap.venueSlug = 'player_home';
  snap.roomId = 'living_room';
  snap.companion.voice = 'gagged';
  const p = resolvePresentation({
    snapshot: snap,
    characterId: 'lexi',
    companionName: 'Lexi',
    emotions: initEmotions('lexi'),
  });
  assert.equal(p.uiMode, 'chat_crisis');
  const comp = p.actors.find((a) => a.id === 'companion');
  assert.equal(comp?.pose, 'gagged');
  assert.deepEqual(comp?.statusBadges, ['Gagged']);
});

test('resolvePresentation: mall travel sets venue background', () => {
  const snap = emptySceneSnapshot();
  snap.coPresent = true;
  snap.venueSlug = 'westside_commons';
  const p = resolvePresentation({
    snapshot: snap,
    characterId: 'mina',
    companionName: 'Mina',
    emotions: initEmotions('mina'),
    venueChanged: true,
  });
  assert.equal(p.venueSlug, 'westside_commons');
  assert.equal(p.backgroundId, 'westside_commons');
  assert.ok(p.animations.some((a) => a.kind === 'fade_in'));
});

test('resolvePresentation: major chaos adds shake animation', () => {
  const snap = emptySceneSnapshot();
  const p = resolvePresentation({
    snapshot: snap,
    characterId: 'mina',
    companionName: 'Mina',
    chaosTone: 'major',
  });
  assert.ok(p.animations.some((a) => a.target === 'companion' && a.kind === 'shake'));
});
