import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySceneSnapshot } from '../inworld/scene_snapshot';
import type { PlayerProgress } from '../db/player_progress';
import { resolveAvailableActions, resolvePlayerAction } from './player_actions';

function baseProgress(overrides: Partial<PlayerProgress> = {}): PlayerProgress {
  return {
    affinity: 50,
    meetArcComplete: true,
    activeArcId: null,
    activeArcStartedAt: null,
    completedArcIds: [],
    badges: [],
    unlockedVenueSlugs: ['player_home', 'the_grind', 'westside_commons'],
    secretTrustPercent: 50,
    canRevealSecret: false,
    canVisitCompanionHome: true,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<Parameters<typeof resolveAvailableActions>[0]> = {}) {
  const snap = emptySceneSnapshot();
  snap.coPresent = true;
  return {
    snapshot: snap,
    progress: baseProgress(),
    inventory: [{ id: 'j1', name: 'Leather jacket', category: 'outerwear' as const, styleTags: [], ownership: 'player' as const }],
    wornItemIds: [] as string[],
    companionName: 'Lexi',
    characterId: 'lexi',
    currentVenueSlug: 'player_home',
    ...overrides,
  };
}

test('resolveAvailableActions: co-present gag and bind actions', () => {
  const snap = emptySceneSnapshot();
  snap.coPresent = true;
  snap.companion.voice = 'gagged';
  snap.companion.mobility = 'restrained';
  const actions = resolveAvailableActions(baseCtx({ snapshot: snap }));
  assert.ok(actions.some((a) => a.id === 'scene.companion.ungag'));
  assert.ok(actions.some((a) => a.id === 'scene.companion.unbind'));
});

test('resolvePlayerAction: ungag preserves bind', () => {
  const snap = emptySceneSnapshot();
  snap.coPresent = true;
  snap.companion.voice = 'gagged';
  snap.companion.mobility = 'restrained';
  const resolved = resolvePlayerAction('scene.companion.ungag', baseCtx({ snapshot: snap }));
  assert.ok(resolved?.message.includes('gag'));
  assert.equal(resolved?.scenePatch?.companionVoice, 'free');
  assert.equal(resolved?.scenePatch?.companionMobility, 'restrained');
});

test('resolvePlayerAction: travel sets venue patch', () => {
  const resolved = resolvePlayerAction('travel:the_grind', baseCtx());
  assert.ok(resolved?.message.includes('Grind'));
  assert.equal(resolved?.scenePatch?.venueSlug, 'the_grind');
  assert.equal(resolved?.scenePatch?.coPresent, true);
});

test('resolveAvailableActions: remote scene skips companion actions', () => {
  const snap = emptySceneSnapshot();
  snap.coPresent = false;
  snap.companion.voice = 'gagged';
  const actions = resolveAvailableActions(baseCtx({ snapshot: snap }));
  assert.equal(actions.some((a) => a.id === 'scene.companion.ungag'), false);
});
