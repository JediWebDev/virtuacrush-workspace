// Pure helpers for the scene system: prompt formatting and phase type.
import type { DailyState } from './story_util';
import { getLocation } from '../inworld/locations';
import { sanitizeHomeBaselineActivity } from '../sim/scene_prompt';

export type ScenePhase = 'home' | 'on_date';

export interface SceneState {
  location: string | null; // venue slug; null = player is at home (remote chat)
}

/**
 * Derives scene phase from state.
 * 'on_date' now means "player has traveled to a location" (not necessarily a date —
 * just any co-present venue). The name is kept for backward compat with scene_composition.ts.
 */
export function scenePhase(scene: SceneState): ScenePhase {
  return scene.location ? 'on_date' : 'home';
}

function closenessNote(affinity?: number): string {
  if (typeof affinity !== 'number' || !Number.isFinite(affinity)) return '';
  return (
    `\nYour current closeness with the user is ${Math.round(affinity)}/100 — let it set how warm, ` +
    `guarded, or flirty you are (low = still getting to know them; high = close and affectionate).`
  );
}

/**
 * Builds the remote-chat situation block (player and companion are APART).
 * Used when scene.location is null and no arc sceneAnchor is active.
 */
export function formatSituationBlock(
  state: Pick<DailyState, 'activity' | 'mood'>,
  _scene: SceneState,
  _characterName: string,
  affinity?: number,
): string {
  const closeness = closenessNote(affinity);
  const activity = state.activity ? sanitizeHomeBaselineActivity(state.activity) : 'taking it easy';
  return (
    `\n\n=== SETTING (default baseline) ===\n` +
    `DEFAULT, when nothing else is going on: you are at your OWN place, ${activity} (mood: ${state.mood || 'easy'}), ` +
    `texting the user from a distance — not in the same room. When you agree to meet up, narrate getting ready or ` +
    `heading out; do not teleport to the venue.\n` +
    `IMPORTANT — this is ONLY the baseline. If the conversation has already moved the scene elsewhere (an in-person ` +
    `meeting, a different location, or an unfolding situation the player has set up), FOLLOW THE CONVERSATION'S current ` +
    `scene instead and stay there. Do NOT drag in these home details, this activity, the "texting remotely" framing, or ` +
    `anyone who was only present back home — they are not in the new scene unless the player brought them there.` +
    closeness
  );
}

export function formatLocationBlock(
  locationSlug: string,
  _displayName: string,
  affinity?: number,
): string {
  const loc = getLocation(locationSlug);
  const closeness = closenessNote(affinity);

  if (!loc) {
    return (
      `\n\n=== CURRENT SETTING ===\n` +
      `You and the player are PHYSICALLY TOGETHER at a location in the city.` +
      closeness
    );
  }

  const homeNote =
    loc.type === 'player_home'
      ? `This is the player's own space — they're on their turf and you're a guest here.`
      : loc.type === 'character_home'
        ? `This is YOUR space — you're on your turf and the player is a guest here.`
        : '';

  return (
    `\n\n=== CURRENT SETTING ===\n` +
    `You and the player are PHYSICALLY TOGETHER at ${loc.name} — ${loc.description}. ` +
    `${loc.atmosphere} ` +
    (homeNote ? homeNote + ' ' : '') +
    `You are both in the same physical space — respond to what's around you, ` +
    `react to the environment, and engage as if genuinely present. ` +
    `The scene evolves with the conversation — follow the history above for the current state.` +
    closeness
  );
}

