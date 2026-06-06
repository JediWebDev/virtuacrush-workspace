import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wornItems, outfitAppeal, describeOutfit, observeOutfit, describeLastSeenOutfit, itemsById } from './wardrobe';
import type { InventoryItem } from './world';

const jacket: InventoryItem = { id: 'jkt', category: 'outerwear', name: 'Black Leather Jacket', styleTags: ['alternative', 'rock', 'edgy'] };
const flannel: InventoryItem = { id: 'fln', category: 'top', name: 'Vintage Flannel', styleTags: ['retro', '90s', 'casual'] };
const inv = [jacket, flannel];

test('wornItems resolves presentation ids against inventory', () => {
  const worn = wornItems({ wornItemIds: ['jkt'], grooming: {} }, inv);
  assert.equal(worn.length, 1);
  assert.equal(worn[0].name, 'Black Leather Jacket');
});

test('outfitAppeal is preference-based: same outfit, different reactions', () => {
  const serenaPrefs = ['alternative', 'creative', 'vintage'];
  const beccaPrefs = ['retro', 'casual', '90s'];
  // leather jacket impresses Serena (alt), not Becca (retro)
  assert.ok(outfitAppeal([jacket], serenaPrefs) > outfitAppeal([jacket], beccaPrefs));
  // vintage flannel impresses Becca, not Serena
  assert.ok(outfitAppeal([flannel], beccaPrefs) > outfitAppeal([flannel], serenaPrefs));
  // no prefs -> neutral
  assert.equal(outfitAppeal([jacket], []), 0);
});

test('describeOutfit lists item names', () => {
  assert.equal(describeOutfit(inv), 'Black Leather Jacket, Vintage Flannel');
});

test('perception: lastSeenOutfit is stale until observed', () => {
  let lastSeen: Record<string, string[]> = { player: ['fln'] }; // saw flannel yesterday
  const by = itemsById(inv);
  assert.equal(describeLastSeenOutfit(lastSeen, 'player', by), 'Vintage Flannel');
  // player changed into the jacket at home; NPC hasn't seen -> still flannel
  // ...then they meet and the NPC observes the current outfit:
  lastSeen = observeOutfit(lastSeen, 'player', ['jkt']);
  assert.equal(describeLastSeenOutfit(lastSeen, 'player', by), 'Black Leather Jacket');
});
