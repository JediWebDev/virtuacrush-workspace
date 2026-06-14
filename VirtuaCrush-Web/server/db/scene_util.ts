// Pure helpers for the scene system: prompt formatting and phase type.
import type { DailyState } from './story_util';

export type ScenePhase = 'home' | 'on_date'; // 'on_date' reserved for future arc-driven scenes

export interface SceneState {
  location: string | null; // venue slug (reserved; currently always null)
}

/**
 * Derives scene phase from state. Always 'home' now that the date loop is
 * removed; retained as a typed hook for future arc-driven co-present scenes.
 */
export function scenePhase(_scene: SceneState): ScenePhase {
  return 'home';
}

function closenessNote(affinity?: number): string {
  if (typeof affinity !== 'number' || !Number.isFinite(affinity)) return '';
  return (
    `\nYour current closeness with the user is ${Math.round(affinity)}/100 — let it set how warm, ` +
    `guarded, or flirty you are (low = still getting to know them; high = close and affectionate).`
  );
}

/**
 * Builds the remote-chat situation block injected into the chat system prompt.
 * For arc-driven co-present scenes, chat.ts overrides this with a SceneAnchor
 * block instead.
 */
export function formatSituationBlock(
  state: Pick<DailyState, 'activity' | 'mood'>,
  _scene: SceneState,
  _characterName: string,
  affinity?: number,
): string {
  const closeness = closenessNote(affinity);
  const activity = state.activity ? state.activity : 'taking it easy';
  return (
    `\n\n=== CURRENT SETTING ===\n` +
    `You are at your OWN place, ${activity} (mood: ${state.mood || 'easy'}). ` +
    `You and the user are NOT in the same room — you're texting from a distance. ` +
    `If asked, you are at home doing your own thing, chatting with them remotely. ` +
    `When you agree to meet up, narrate getting ready or heading out — do not teleport to the venue.` +
    closeness
  );
}
