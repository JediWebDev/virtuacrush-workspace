// Pure helpers for the scene/dating loop: prompt formatting and phase derivation.
import { getLocation } from '../inworld/scenes';
import type { DailyState } from './story_util';
import type { Incident } from './world_util';

export type SceneMode = 'apart' | 'together';
export type ScenePhase = 'home' | 'on_date' | 'jailed';

export interface SceneState {
  mode: SceneMode;
  location: string | null;        // venue slug when together
  billPending: boolean;
  jailedUntil?: string | null;     // ISO timestamp while the user is locked up; null/absent = free
  bailCallUsed?: boolean;          // the one phone call from jail has been spent
  incidents?: Incident[];          // priced mischief incidents on the current date
}

/**
 * The authoritative phase of the dating loop, derived from the scene:
 *  - 'jailed'   : the user is locked up until the jail timer elapses,
 *  - 'on_date'  : physically together at a venue,
 *  - 'home'     : no date in progress; solo, reachable remotely.
 * Every system (UI gating, status strip, auto-spawn, prompt) keys off this.
 */
export function scenePhase(scene: SceneState): ScenePhase {
  if (scene.jailedUntil && new Date(scene.jailedUntil).getTime() > Date.now()) return 'jailed';
  if (scene.mode === 'together') return 'on_date';
  return 'home';
}

function closenessNote(affinity?: number): string {
  if (typeof affinity !== 'number' || !Number.isFinite(affinity)) return '';
  return (
    `\nYour current closeness with the user is ${Math.round(affinity)}/100 — let it set how warm, ` +
    `guarded, or flirty you are (low = still getting to know them; high = close and affectionate).`
  );
}

const LOGISTICS_REALISM =
  ` Be realistic about your own means and transport (see your ABOUT YOU facts). If the user proposes ` +
  `something absurd, lazy, or one-sided — like making you do all the travelling or pay for everything — ` +
  `react with mild, in-character annoyance instead of just going along with it.`;

/**
 * Builds the situation block injected into the chat system prompt. Three cases:
 *  - together: anchored at the venue (authoritative),
 *  - apart with a planned date: getting ready / sorting logistics,
 *  - apart: at their own place, reachable remotely.
 */
export function formatSituationBlock(
  state: Pick<DailyState, 'activity' | 'mood'>,
  scene: SceneState,
  characterName: string,
  affinity?: number,
): string {
  const closeness = closenessNote(affinity);

  if (scene.mode === 'together') {
    const loc = getLocation(scene.location);
    if (loc) {
      return (
        `\n\n=== CURRENT SETTING (happening RIGHT NOW, in real time) ===\n` +
        `You are physically OUT ON A DATE with the user, together ${loc.description}. ` +
        `This is your current location: ${loc.label}. You are NOT at home and you are NOT apart from the user.\n` +
        `If the user asks where you are, where you both are, or what you're doing, your answer is: here together at ${loc.label}. ` +
        `Never say you are at home or alone. Stay present and let the place color your words — you can reference ${loc.cues}. ` +
        `React directly to what the user does; don't give one-word non-answers.${closeness}`
      );
    }
  }

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

