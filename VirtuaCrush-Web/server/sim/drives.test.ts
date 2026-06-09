import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDrives,
  initDrives,
  advanceDrives,
  surfacedDrive,
  flavorBlock,
  eventCard,
  applyChoice,
} from './drives';

test('getDrives: everyone has common drives; quirk characters get a third', () => {
  const ash = getDrives('ash').map((d) => d.key);
  assert.deepEqual(ash, ['desire', 'playful', 'thirst']);
  assert.deepEqual(getDrives('nobody').map((d) => d.key), ['desire', 'playful']);
});

test('advanceDrives: desire builds while apart at night, decays back toward baseline together', () => {
  const defs = getDrives('mina');
  const v0 = initDrives(defs);
  const up = advanceDrives(v0, defs, { affinity: 80, apart: true, night: true, afterPositive: true }, 3);
  assert.ok(up.desire > v0.desire, 'desire should climb while apart at night with affinity');

  // Now together, calm — it should fall back toward baseline.
  const down = advanceDrives({ ...up, desire: 90 }, defs, { affinity: 80, apart: false, night: false, afterPositive: false }, 6);
  assert.ok(down.desire < 90, 'desire should decay toward baseline when satisfied/together');
});

test("advanceDrives: ash's thirst spikes at night", () => {
  const defs = getDrives('ash');
  const day = advanceDrives(initDrives(defs), defs, { affinity: 50, apart: true, night: false, afterPositive: false }, 4);
  const night = advanceDrives(initDrives(defs), defs, { affinity: 50, apart: true, night: true, afterPositive: false }, 4);
  assert.ok(night.thirst > day.thirst);
});

test('surfacedDrive: event threshold beats flavor; nothing under threshold', () => {
  const defs = getDrives('ash');
  assert.equal(surfacedDrive({ desire: 10, playful: 10, thirst: 10 }, defs), null);
  const flav = surfacedDrive({ desire: 60, playful: 10, thirst: 10 }, defs);
  assert.equal(flav?.level, 'flavor');
  assert.equal(flav?.def.key, 'desire');
  const evt = surfacedDrive({ desire: 60, playful: 10, thirst: 95 }, defs);
  assert.equal(evt?.level, 'event');
  assert.equal(evt?.def.key, 'thirst');
});

test('flavorBlock/eventCard: produce prompt text + three consent options', () => {
  const def = getDrives('serena').find((d) => d.key === 'mischief')!;
  assert.ok(flavorBlock(def, 'Serena').includes('Serena'));
  const card = eventCard(def, 'Serena');
  assert.equal(card.drive, 'mischief');
  assert.ok(card.prompt.startsWith('Serena'));
  assert.deepEqual(card.options.map((o) => o.id), ['encourage', 'redirect', 'decline']);
});

test('applyChoice: encourage satisfies + raises affinity; decline drops a bit', () => {
  const def = getDrives('mina').find((d) => d.key === 'desire')!;
  const enc = applyChoice({ desire: 90, playful: 30 }, def, 'encourage', 'Mina');
  assert.ok(enc.values.desire < 90);
  assert.ok(enc.affinityDelta > 0);

  const dec = applyChoice({ desire: 90, playful: 30 }, def, 'decline', 'Mina');
  assert.ok(dec.values.desire < 90);
  assert.ok(dec.affinityDelta < 0);
});
