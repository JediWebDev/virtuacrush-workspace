import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSceneNpc, resolveSceneNpcs } from '../inworld/npc_schema';
import { composeWorld } from './compose';
import { planChaosTurn, chaosUiHint, formatChaosPromptBlock } from './chaos_engine';
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
  it('enrichWorldWithSceneNpcs adds friend to present list when co-present', () => {
    const world = baseWorld();
    const friend = resolveSceneNpc({ name: 'Rachel', stance: 'friend', archetypeId: 'companion_best_friend' });
    const enriched = enrichWorldWithSceneNpcs(world, [friend], { companionId: 'mina', coPresent: true });
    const id = npcEntityIdFromName('Rachel');
    assert.ok(enriched.npcs[id]);
    assert.ok(enriched.scene.presentNpcIds.includes(id));
    assert.equal(enriched.npcs[id]!.goals[0]?.id, 'increase_closeness');
  });

  it('remote chat keeps scene friend off-scene for chaos entrance', () => {
    const world = baseWorld();
    const friend = resolveSceneNpc({ name: 'Rachel', stance: 'friend', archetypeId: 'companion_best_friend' });
    const enriched = enrichWorldWithSceneNpcs(world, [friend], { companionId: 'mina', coPresent: false });
    const id = npcEntityIdFromName('Rachel');
    assert.ok(enriched.npcs[id]);
    assert.ok(!enriched.scene.presentNpcIds.includes(id));
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
  it('skips planned disaster when environmental chaos suppressed', () => {
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
      disruptions: [{ id: 'd1', poolId: 'earthquake_tremor', kind: 'disaster', atTurn: 1 }],
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
      suppressEnvironmentalChaos: true,
    });
    const result = planChaosTurn(ctx);
    assert.equal(result.firedDisruption, null);
    assert.equal(result.directiveBlock, '');
  });

  it('fires planned disaster when due', () => {
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
      disruptions: [{ id: 'd1', poolId: 'power_outage', kind: 'disaster', atTurn: 1 }],
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
    assert.match(result.directiveBlock, /MANDATORY/);
    assert.match(result.directiveBlock, /MANDATORY/);
  });

  it('fires chaos at venues (no longer suppressed by default)', () => {
    const comp: SceneComposition = {
      composedAt: new Date().toISOString(),
      forDate: '2026-01-01',
      phase: 'on_date',
      locationSlug: 'mall',
      timeLabel: 'evening',
      weather: 'clear',
      setting: 'at the mall',
      details: [],
      outfit: 'casual',
      activity: 'talking',
      cast: [],
      disruptions: [{ id: 'd1', poolId: 'fire_alarm', kind: 'disaster', atTurn: 1 }],
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
      atVenue: true,
    });
    const result = planChaosTurn(ctx);
    assert.ok(result.firedDisruption);
    assert.match(result.directiveBlock, /fire alarm/i);
  });

  it('ephemeral chaos fires for pack-style sessions without composition', () => {
    const ctx = buildSceneContext({
      world: baseWorld(),
      composition: null,
      resolvedNpcs: [],
      activeArc: null,
      turn: 5,
      companionId: 'mina',
      companionName: 'Mina',
      atVenue: false,
      mode: 'pack',
    });
    const result = planChaosTurn(ctx, { rng: () => 0.01 });
    assert.match(result.directiveBlock, /MANDATORY/);
    assert.equal(result.firedDisruption?.id, 'ephemeral');
  });

  it('lower chaosIntensity suppresses schema npc chaos', () => {
    const rival = resolveSceneNpc({ name: 'Urik', stance: 'enemy', archetypeId: 'rival' });
    const ctx = buildSceneContext({
      world: baseWorld(),
      composition: null,
      resolvedNpcs: [rival],
      activeArc: null,
      turn: 5,
      companionId: 'mina',
      companionName: 'Mina',
      atVenue: false,
    });
    let rolls = 0;
    const result = planChaosTurn(ctx, {
      chaosIntensity: 0.35,
      rng: () => {
        rolls++;
        return rolls === 1 ? 0.99 : 0.5;
      },
    });
    assert.equal(result.firedNpcChaosKey, null);
    assert.ok(!result.directiveBlock.includes('MANDATORY'));
  });

  it('only one chaos block fires per turn', () => {
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
      disruptions: [{ id: 'd1', poolId: 'power_outage', kind: 'disaster', atTurn: 1 }],
      firedDisruptions: [],
    };
    const rival = resolveSceneNpc({ name: 'Urik', stance: 'enemy', archetypeId: 'rival' });
    const ctx = buildSceneContext({
      world: baseWorld(),
      composition: comp,
      resolvedNpcs: [rival],
      activeArc: null,
      turn: 6,
      companionId: 'mina',
      companionName: 'Mina',
      atVenue: false,
    });
    const result = planChaosTurn(ctx, { rng: () => 0.01 });
    const matches = result.directiveBlock.match(/MANDATORY/g);
    assert.equal(matches?.length ?? 0, 1);
  });

  it('chaosUiHint prioritizes world crime over disruption', () => {
    const hint = chaosUiHint(
      {
        directiveBlock: 'Security arrives on-scene.',
        firedDisruption: { id: 'd1', poolId: 'fire_alarm', kind: 'disaster', atTurn: 3 },
        firedNpcChaosKey: null,
        agencyActions: [],
        residues: [],
      },
      {
        companionName: 'Mina',
        characterId: 'mina',
        resolvedNpcs: [],
        worldEvent: { kind: 'crime', crimeType: 'fire' },
      },
    );
    assert.equal(hint?.title, 'Security responded');
    assert.equal(hint?.tone, 'major');
  });

  it('chaosUiHint surfaces NPC interrupt with display name', () => {
    const rival = resolveSceneNpc({ name: 'Urik', stance: 'enemy', archetypeId: 'rival' });
    const hint = chaosUiHint(
      {
        directiveBlock: 'Urik walks in unannounced.',
        firedDisruption: null,
        firedNpcChaosKey: null,
        agencyActions: [{ npc: 'Urik', action: 'interrupt_date', reason: 'jealous' }],
        residues: [],
      },
      { companionName: 'Mina', characterId: 'mina', resolvedNpcs: [rival] },
    );
    assert.equal(hint?.title, 'Urik walked in');
    assert.equal(hint?.tone, 'major');
  });

  it('chaosUiHint maps disaster pools', () => {
    const hint = chaosUiHint(
      {
        directiveBlock: 'The power cuts out mid-conversation.',
        firedDisruption: { id: 'd2', poolId: 'power_outage', kind: 'disaster', atTurn: 2 },
        firedNpcChaosKey: null,
        agencyActions: [],
        residues: [],
      },
      { companionName: 'Mina', characterId: 'mina', resolvedNpcs: [] },
    );
    assert.equal(hint?.title, 'The power went out');
    assert.equal(hint?.tone, 'major');
  });

  it('chaosUiHint returns null when nothing fired', () => {
    const hint = chaosUiHint(
      {
        directiveBlock: '',
        firedDisruption: null,
        firedNpcChaosKey: null,
        agencyActions: [],
        residues: [],
      },
      { companionName: 'Mina', characterId: 'mina', resolvedNpcs: [] },
    );
    assert.equal(hint, null);
  });

  it('chaosUiHint returns null when disruption metadata exists but directive is empty', () => {
    const hint = chaosUiHint(
      {
        directiveBlock: '',
        firedDisruption: { id: 'd2', poolId: 'power_outage', kind: 'disaster', atTurn: 2 },
        firedNpcChaosKey: null,
        agencyActions: [],
        residues: [],
      },
      { companionName: 'Mina', characterId: 'mina', resolvedNpcs: [] },
    );
    assert.equal(hint, null);
  });

  it('formatChaosPromptBlock requires JSON lines for the beat', () => {
    const block = formatChaosPromptBlock('The power cuts out.', 'Kayla', ['Femi']);
    assert.ok(block.includes('REQUIRED'));
    assert.ok(block.includes('Kayla'));
    assert.ok(block.includes('Femi'));
  });
});
