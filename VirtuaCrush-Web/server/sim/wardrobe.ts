// Clothing as a simulation system: resolve worn items, score outfit appeal
// against an NPC's fashion preferences (so the SAME outfit lands differently for
// different NPCs), describe outfits, and update perception when an NPC observes
// what someone is wearing. Pure + testable. Future image generation reads the
// same data (presentation + inventory + appearance) with no sim changes.
import type { InventoryItem, PresentationState, Grooming } from './world';

export function itemsById(items: InventoryItem[]): Record<string, InventoryItem> {
  const map: Record<string, InventoryItem> = {};
  for (const it of items) map[it.id] = it;
  return map;
}

/** The actual InventoryItems an actor is wearing right now. */
export function wornItems(presentation: PresentationState, inventory: InventoryItem[]): InventoryItem[] {
  const by = itemsById(inventory);
  return presentation.wornItemIds.map((id) => by[id]).filter(Boolean) as InventoryItem[];
}

export function outfitStyleTags(items: InventoryItem[]): string[] {
  const tags = new Set<string>();
  for (const it of items) for (const t of it.styleTags) tags.add(t.toLowerCase());
  return [...tags];
}

/**
 * How appealing an outfit is to someone with these fashion preferences: the
 * count of the outfit's style tags that match their liked tags. Preference-based,
 * not a flat "formal => +10", so a leather jacket impresses Serena but not Becca.
 */
export function outfitAppeal(items: InventoryItem[], fashionPrefs: string[]): number {
  if (!fashionPrefs.length) return 0;
  const prefs = new Set(fashionPrefs.map((s) => s.toLowerCase()));
  let matches = 0;
  for (const t of outfitStyleTags(items)) if (prefs.has(t)) matches++;
  return matches;
}

export function describeOutfit(items: InventoryItem[]): string {
  return items.map((i) => i.name).join(', ');
}

/** Returns a NEW lastSeenOutfit map with `targetId` updated to what they're
 *  wearing now — call when an NPC actually sees the target (co-present). */
export function observeOutfit(
  lastSeen: Record<string, string[]>,
  targetId: string,
  wornItemIds: string[],
): Record<string, string[]> {
  return { ...lastSeen, [targetId]: [...wornItemIds] };
}

/** Describes the outfit an NPC LAST SAW on a target (may be stale). */
export function describeLastSeenOutfit(
  lastSeen: Record<string, string[]>,
  targetId: string,
  byId: Record<string, InventoryItem>,
): string {
  const ids = lastSeen[targetId] ?? [];
  const names = ids.map((id) => byId[id]?.name).filter(Boolean);
  return names.join(', ');
}

/** Joins grooming into a readable phrase ('' if nothing set). */
export function describeGrooming(g: Grooming): string {
  return [
    g.hairstyle, g.makeup && `${g.makeup} makeup`, g.fragrance && `wearing ${g.fragrance}`,
  ].filter(Boolean).join(', ');
}

