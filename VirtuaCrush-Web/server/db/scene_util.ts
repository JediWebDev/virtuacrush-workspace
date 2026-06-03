// Pure helpers for the scene/dating loop: prompt formatting, choosing which kind
// of choice to offer, and per-option effects. No DB / runtime imports.
import { getLocation, type LocationKind } from '../inworld/scenes';
import type { DailyState } from './story_util';

export type SceneMode = 'apart' | 'together';
export type ChoiceKind = 'date' | 'bill' | 'goal';

export interface SceneState {
  mode: SceneMode;
  location: string | null; // venue slug when together
  billPending: boolean;
}

// Relationship-affinity effects for the dating choices (server-authoritative).
export const CHOICE_DATE_AFFINITY = 1.5; // picking a place to go together
export const CHOICE_BILL_PAY_AFFINITY = 2; // user picks up the bill
export const CHOICE_BILL_LETPAY_AFFINITY = 0.75; // user lets the character pay

/**
 * Builds the situation block injected into the chat system prompt. When on a
 * date it anchors the character in the venue; when apart it places them at home,
 * reachable remotely.
 */
export function formatSituationBlock(
  state: Pick<DailyState, 'activity' | 'mood'>,
  scene: SceneState,
  characterName: string,
): string {
  if (scene.mode === 'together') {
    const loc = getLocation(scene.location);
    if (loc) {
      return (
        `\n\nSCENE — YOU ARE ON A DATE RIGHT NOW: You and the user are together ${loc.description}. ` +
        `Stay fully present in this moment and let the setting color what you say — you can reference ${loc.cues}. ` +
        `Do not talk as if you're at home or apart; you are here, together.`
      );
    }
  }
  const activity = state.activity ? state.activity : 'taking it easy';
  return (
    `\n\nWHAT YOU'RE UP TO: You're at your own place, ${activity} (mood: ${state.mood || 'easy'}). ` +
    `You and the user are texting from a distance right now, not in the same room.`
  );
}

/**
 * Decides which kind of choice to surface:
 *  - 'bill' when on a date at a paid venue with an unsettled bill,
 *  - 'goal' on the rare goal-beat when the character is at home,
 *  - 'date' otherwise (the default — where to go / what to do together).
 */
export function chooseChoiceKind(params: {
  mode: SceneMode;
  locationKind: LocationKind | null;
  billPending: boolean;
  preferGoal: boolean;
}): ChoiceKind {
  if (params.mode === 'together' && params.locationKind === 'paid' && params.billPending) {
    return 'bill';
  }
  if (params.mode === 'apart' && params.preferGoal) {
    return 'goal';
  }
  return 'date';
}

/** Rare goal-beat cadence given the running user-message count. */
export function isGoalBeatDue(userMessageCount: number): boolean {
  // Choices fire at counts 2, 6, 10, 14, ... (index k = (count-2)/4).
  // Make every 3rd of those a goal beat: counts 10, 22, 34, ...
  if (userMessageCount < 6 || (userMessageCount - 2) % 4 !== 0) return false;
  const k = (userMessageCount - 2) / 4;
  return k % 3 === 2;
}

/** Affinity delta for a bill choice: index 0 = user pays, index 1 = character pays. */
export function billAffinity(optionIndex: number): number {
  return optionIndex === 0 ? CHOICE_BILL_PAY_AFFINITY : CHOICE_BILL_LETPAY_AFFINITY;
}
