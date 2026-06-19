import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSceneNpc, resolveSceneNpcs } from '../inworld/npc_schema';
import { composeWorld } from './compose';
import { planChaosTurn } from './chaos_engine';
import { buildSceneContext } from './scene_context';
import { enrichWorldWithSceneNpcs, npcEntityIdFromName } from './world_npcs';
import type { SceneComposition } from './scene_composer';

const profile = {
  displayName: 'Alex',
  appearance: {},
  biography: { interests: [], hobbies: [], goals: [], fears: [], values: [] },
};

function baseWorld(companionId = 'mina') {
  return composeWorld({
    profile,
    presentation: { wornItemIds: [], grooming: {} },
    inventory: [],
    phase: 'home',
    location: null,
    companionId,
    companionName: 'Mina',
    companionAffinity: 40,
  });
}

describe('world_npcs', () => {
  it('enrichWorldWithSceneNpcs adds friend to present list', () => {
    const world = baseWorld();
    const friend = resolveSceneNpc({ name: 'Rachel', stance: 'friend', archetypeId: 'companion_best_friend' });
    const enriched = enrichWorldWithSceneNpcs(world, [friend], { companionId: 'mina', coPresent: false });
    const id = npcEntityIdFromName('Rachel');
    assert.ok(enriched.npcs[id]);
    assert.ok(enriched.scene.presentNpcIds.includes(id));
    assert.equal(enriched.npcs[id]!.goals[0]?.id, 'increase_closeness');
  });

  it('enemy off-scene gets outcompete goal and belief companion is with player on date', () => {
    const world = composeWorld({
      profile,
      presentation: { wornItemIds: [], grooming: {} },
      inventory: [],
      phase: 'on_date',
      location: 'mall',
      companionId: 'mina',
      companionName: 'Mina',
      companionAffinity: 40,
    });
    const rival = resolveSceneNpc({ name: 'Urik', stance: 'enemy', archetypeId: 'rival' });
    const enriched = enrichWorldWithSceneNpcs(world, [rival], { companionId: 'mina', coPresent: false });
    const id = npcEntityIdFromName('Urik');
    assert.equal(enriched.npcs[id]!.goals[0]?.id, 'outcompete_player');
    assert.equal(enriched.npcs[id]!.knowledge.beliefs.mina?.withPlayer, true);
    assert.ok(!enriched.scene.presentNpcIds.includes(id));
  });
});

describe('chaos_engine', () => {
  it('fires ambient disruption when due', () => {
    const comp: SceneComposition = {
      composedAt: new Date().toISOString(),
      forDate: '2026-01-01',
      phase: 'home',
      locationSlug: null,
      timeLabel: 'evening',
      weather: 'clear',
      setting: 'at home',
      details: [],
      outfit: 'casual',
      activity: 'scrolling',
      cast: [],
      disruptions: [{ id: 'd1', poolId: 'notification_swipe', kind: 'texture', atTurn: 1 }],
      firedDisruptions: [],
    };
    const ctx = buildSceneContext({
      world: baseWorld(),
      composition: comp,
      resolvedNpcs: [],
      activeArc: null,
      turn: 1,
      companionId: 'mina',
      companionName: 'Mina',
      atVenue: false,
    });
    const result = planChaosTurn(ctx);
    assert.ok(result.firedDisruption);
    assert.match(result.directiveBlock, /DISRUPTION THIS TURN/);
  });

  it('suppresses ambient disruptions when co-present', () => {
    const comp: SceneComposition = {
      composedAt: new Date().toISOString(),
      forDate: '2026-01-01',
      phase: 'on_date',
      locationSlug: 'mall',
      timeLabel: 'afternoon',
      weather: 'clear',
      setting: 'at the mall',
      details: [],
      outfit: 'cute top',
      activity: 'shopping',
      cast: [],
      disruptions: [{ id: 'd1', poolId: 'mom_call', kind: 'beat', atTurn: 1 }],
      firedDisruptions: [],
    };
    const ctx = buildSceneContext({
      world: baseWorld(),
      composition: comp,
      resolvedNpcs: [],
      activeArc: {
        id: 'test',
        characterId: 'mina',
        introNarrative: 'At the mall.',
        npcInstruction: 'x',
        completionCriteria: 'y',
        completionExamples: [],
        tone: 'light',
        rarity: 'common',
        repeatable: false,
        arcTags: ['romance'],
        sceneAnchor: { setting: 'mall', situation: 'shopping', coPresent: true },
      },
      turn: 1,
      companionId: 'mina',
      companionName: 'Mina',
      atVenue: false,
    });
    const result = planChaosTurn(ctx);
    assert.equal(result.firedDisruption, null);
    assert.ok(!result.directiveBlock.includes('DISRUPTION THIS TURN'));
  });

  it('schema npc chaos picks off-scene enemy with deterministic rng', () => {
    const rival = resolveSceneNpc({ name: 'Urik', stance: 'enemy', archetypeId: 'rival' });
    const ctx = buildSceneContext({
      world: baseWorld(),
      composition: null,
      resolvedNpcs: [rival],
      activeArc: null,
      turn: 10,
      companionId: 'mina',
      companionName: 'Mina',
      atVenue: false,
    });
    let rolls = 0;
    const result = planChaosTurn(ctx, {
      rng: () => {
        rolls++;
        return rolls === 1 ? 0.99 : 0.01; // agency low, chaos pick high then fire
      },
    });
    assert.match(result.directiveBlock, /CHAOS EVENT \(schema — Urik\)/);
    assert.equal(result.firedNpcChaosKey, 'urik');
  });
});
