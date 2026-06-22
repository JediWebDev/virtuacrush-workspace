// Engine-owned player actions — structured inputs the client can tap instead of
// free-text that the LLM must guess. Scene, travel, and inventory actions resolve
// to canonical *action* messages plus optional scene patches.

import type { InventoryItem } from './world';
import type { PlayerProgress } from '../db/player_progress';
import type { SceneSnapshot, SceneSnapshotPatch } from '../inworld/scene_snapshot';
import { finalizeCompanionConditionPatch } from '../inworld/scene_companion_condition';
import { getLocation, LOCATIONS, type CityLocation } from '../inworld/locations';
import { formatSpatialLocation } from './spatial';

export type PlayerActionCategory = 'scene' | 'travel' | 'inventory';

export interface PlayerAction {
  id: string;
  label: string;
  category: PlayerActionCategory;
  /** Short hint shown in the actions panel. */
  hint?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface ResolvedPlayerAction {
  message: string;
  scenePatch?: SceneSnapshotPatch;
}

export interface PlayerActionContext {
  snapshot: SceneSnapshot | null;
  progress: PlayerProgress;
  inventory: InventoryItem[];
  wornItemIds: string[];
  companionName: string;
  characterId: string;
  currentVenueSlug: string | null;
}

const TRAVEL_PREFIX = 'travel:';
const EQUIP_PREFIX = 'inventory.equip:';
const GIFT_PREFIX = 'inventory.gift:';

function sceneActions(ctx: PlayerActionContext): PlayerAction[] {
  const snap = ctx.snapshot;
  if (!snap?.coPresent) return [];
  const out: PlayerAction[] = [];
  if (snap.companion.voice === 'gagged') {
    out.push({
      id: 'scene.companion.ungag',
      label: 'Remove gag',
      category: 'scene',
      hint: `Take the tape or gag off ${ctx.companionName}'s mouth`,
    });
  }
  if (snap.companion.mobility === 'restrained') {
    out.push({
      id: 'scene.companion.unbind',
      label: 'Cut restraints',
      category: 'scene',
      hint: `Free ${ctx.companionName}'s wrists or zip ties`,
    });
  }
  return out;
}

function travelActions(ctx: PlayerActionContext): PlayerAction[] {
  const unlocked = new Set(ctx.progress.unlockedVenueSlugs);
  return LOCATIONS.map((loc) => {
    const locked =
      loc.type === 'character_home' &&
      loc.characterId !== ctx.characterId &&
      loc.affinityRequired != null &&
      ctx.progress.affinity < loc.affinityRequired;
    const atVenue = ctx.currentVenueSlug === loc.slug;
    return {
      id: `${TRAVEL_PREFIX}${loc.slug}`,
      label: atVenue ? `${loc.shortName} (here)` : `Go to ${loc.shortName}`,
      category: 'travel' as const,
      hint: loc.description.slice(0, 80),
      disabled: locked || atVenue,
      disabledReason: locked
        ? `Requires ${loc.affinityRequired}+ closeness`
        : atVenue
          ? 'Already here'
          : undefined,
    };
  }).filter((a) => !a.disabled || a.disabledReason?.includes('Requires'));
}

function inventoryActions(ctx: PlayerActionContext): PlayerAction[] {
  const worn = new Set(ctx.wornItemIds);
  const out: PlayerAction[] = [];
  for (const item of ctx.inventory.slice(0, 12)) {
    if (!worn.has(item.id)) {
      out.push({
        id: `${EQUIP_PREFIX}${item.id}`,
        label: `Wear ${item.name}`,
        category: 'inventory',
        hint: 'Update your outfit for this scene',
      });
    }
    if (ctx.snapshot?.coPresent) {
      out.push({
        id: `${GIFT_PREFIX}${item.id}`,
        label: `Gift ${item.name}`,
        category: 'inventory',
        hint: `Offer it to ${ctx.companionName}`,
      });
    }
  }
  return out;
}

/** Actions available this turn — engine derives from snapshot, progress, inventory. */
export function resolveAvailableActions(ctx: PlayerActionContext): PlayerAction[] {
  return [...sceneActions(ctx), ...travelActions(ctx), ...inventoryActions(ctx)];
}

function travelPatch(slug: string): SceneSnapshotPatch | undefined {
  const loc = getLocation(slug);
  if (!loc) return undefined;
  const spatial = formatSpatialLocation(slug, null);
  return {
    venueSlug: slug,
    roomId: loc.type === 'player_home' ? 'living_room' : null,
    coPresent: true,
    location: spatial || loc.name,
  };
}

function resolveTravelAction(slug: string): ResolvedPlayerAction | null {
  const loc = getLocation(slug);
  if (!loc) return null;
  return {
    message: `*head to ${loc.name}*`,
    scenePatch: travelPatch(slug),
  };
}

function resolveSceneAction(id: string, ctx: PlayerActionContext): ResolvedPlayerAction | null {
  const prior = ctx.snapshot;
  if (!prior?.coPresent) return null;
  if (id === 'scene.companion.ungag' && prior.companion.voice === 'gagged') {
    return {
      message: `*carefully remove the gag from ${ctx.companionName}'s mouth*`,
      scenePatch: finalizeCompanionConditionPatch(prior, { companionVoice: 'free' }),
    };
  }
  if (id === 'scene.companion.unbind' && prior.companion.mobility === 'restrained') {
    return {
      message: `*cut the restraints holding ${ctx.companionName}*`,
      scenePatch: finalizeCompanionConditionPatch(prior, { companionMobility: 'free' }),
    };
  }
  return null;
}

function resolveInventoryAction(
  id: string,
  ctx: PlayerActionContext,
): ResolvedPlayerAction | null {
  if (id.startsWith(EQUIP_PREFIX)) {
    const itemId = id.slice(EQUIP_PREFIX.length);
    const item = ctx.inventory.find((i) => i.id === itemId);
    if (!item) return null;
    return { message: `*adjust my outfit — put on ${item.name}*` };
  }
  if (id.startsWith(GIFT_PREFIX)) {
    const itemId = id.slice(GIFT_PREFIX.length);
    const item = ctx.inventory.find((i) => i.id === itemId);
    if (!item || !ctx.snapshot?.coPresent) return null;
    return { message: `*offer ${item.name} to ${ctx.companionName}*` };
  }
  return null;
}

/** Resolve a tapped action id to the message + optional engine scene patch. */
export function resolvePlayerAction(
  actionId: string,
  ctx: PlayerActionContext,
): ResolvedPlayerAction | null {
  const allowed = resolveAvailableActions(ctx);
  const def = allowed.find((a) => a.id === actionId);
  if (!def || def.disabled) return null;

  if (actionId.startsWith(TRAVEL_PREFIX)) {
    return resolveTravelAction(actionId.slice(TRAVEL_PREFIX.length));
  }
  if (actionId.startsWith('scene.')) {
    return resolveSceneAction(actionId, ctx);
  }
  if (actionId.startsWith('inventory.')) {
    return resolveInventoryAction(actionId, ctx);
  }
  return null;
}

/** Map pins for the city map UI. */
export function mapLocationsForProgress(
  characterId: string,
  progress: PlayerProgress,
  currentVenueSlug: string | null,
): Array<CityLocation & { locked: boolean; current: boolean }> {
  return LOCATIONS.map((loc) => {
    const locked =
      loc.type === 'character_home' &&
      loc.characterId !== characterId &&
      loc.affinityRequired != null &&
      progress.affinity < loc.affinityRequired;
    return {
      ...loc,
      locked,
      current: currentVenueSlug === loc.slug,
    };
  });
}
