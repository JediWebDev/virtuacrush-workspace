import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_AFFINITY_SCALE,
  MEET_AFFINITY_REWARD,
  SECRET_REVEAL_AFFINITY,
  secretTrustProgress,
} from './progression';
import { consequencesFor } from './sim/rules';
import type { WorldState, NpcEntity } from './sim/world';
import { emptyProfile } from './sim/player';

function world(): WorldState {
  const npc = (id: string, name: string): NpcEntity => ({
    id,
    name,
    role: 'companion',
    location: 'mall',
    currentActivity: 'idling',
    mood: 'calm',
    personality: { warmth: 0.5, volatility: 0.5, boldness: 0.5, extraversion: 0.5, grudge: 0.5 },
    appearance: {},
    presentation: { wornItemIds: [], grooming: {} },
    inventory: [],
    fashionPrefs: [],
    needs: {},
    goals: [],
    relationships: {},
    knowledge: { knownLocations: [], beliefs: {}, knownPlayerFacts: [], lastSeenOutfit: {}, rumors: [] },
    memories: [],
    schedule: [],
    faction: null,
    economy: { money: 0, reputation: {} },
  });
  return {
    tick: 1,
    user: {
      location: 'mall',
      status: 'free',
      money: 100,
      profile: emptyProfile('You'),
      presentation: { wornItemIds: [], grooming: {} },
      inventory: [],
    },
    scene: { phase: 'on_date', where: 'mall', companionId: 'serena', presentNpcIds: ['serena'] },
    npcs: { serena: npc('serena', 'Serena') },
  };
}

test('CHAT_AFFINITY_SCALE halves positive intent rewards', () => {
  const compliment = consequencesFor({ type: 'social', subtype: 'compliment' }, world());
  const delta = compliment.find((c) => c.type === 'affinity')?.delta ?? 0;
  assert.equal(delta, 0.5);
  assert.equal(CHAT_AFFINITY_SCALE, 0.5);
});

test('secret trust progress lags behind raw affinity ratio', () => {
  const half = secretTrustProgress(SECRET_REVEAL_AFFINITY / 2);
  assert.ok(half < 50);
  assert.equal(secretTrustProgress(SECRET_REVEAL_AFFINITY), 85);
});

test('arc completion rewards are modest', () => {
  assert.ok(MEET_AFFINITY_REWARD <= 5);
  assert.ok(SECRET_REVEAL_AFFINITY >= 60);
});
