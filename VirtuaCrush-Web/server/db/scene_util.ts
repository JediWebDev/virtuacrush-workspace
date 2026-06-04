// Pure helpers for the scene/dating loop: prompt formatting, choosing which kind
// of choice to offer, and per-option effects. No DB / runtime imports.
import { getLocation, type LocationKind } from '../inworld/scenes';
import type { DailyState } from './story_util';

export type SceneMode = 'apart' | 'together';
export type ScenePhase = 'home' | 'planning' | 'on_date';
export type ChoiceKind = 'date' | 'bill' | 'goal';

export interface SceneState {
  mode: SceneMode;
  location: string | null;        // venue slug when together
  billPending: boolean;
  plannedLocation?: string | null; // agreed venue while still apart (logistics phase)
}

/**
 * The authoritative phase of the dating loop, derived from the scene:
 *  - 'on_date'  : physically together at a venue,
 *  - 'planning' : a date is agreed but they're still apart (sorting logistics),
 *  - 'home'     : no date in progress; solo, reachable remotely.
 * Every system (UI gating, status strip, auto-spawn, prompt) keys off this.
 */
export function scenePhase(scene: SceneState): ScenePhase {
  if (scene.mode === 'together') return 'on_date';
  if (scene.plannedLocation) return 'planning';
  return 'home';
}

// Relationship-affinity effects for the dating choices (server-authoritative).
export const CHOICE_DATE_AFFINITY = 1.5; // picking a place to go together
export const CHOICE_BILL_PAY_AFFINITY = 2; // user picks up the bill
export const CHOICE_BILL_LETPAY_AFFINITY = 0.75; // user lets the character pay

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
        `React directly to what the user does; don't give one-word non-answers.
` +
        `THE WORLD IS REAL AND HAS CONSEQUENCES: this is a public place with other people and staff around, including ${loc.authority}. ` +
        `If the user does ANYTHING disruptive, reckless, messy, destructive, embarrassing, or against the rules (even creative or unexpected things), ` +
        `have ${loc.authority} and/or bystanders step in and react believably — describe it in *stage directions* — and react in character yourself. ` +
        `Never ignore disruptive behavior or just play along with something that would clearly cause a scene.${closeness}`
      );
    }
  }

  if (scene.mode === 'apart' && scene.plannedLocation) {
    const loc = getLocation(scene.plannedLocation);
    const venue = loc ? loc.label : 'somewhere together';
    return (
      `\n\n=== CURRENT SETTING ===\n` +
      `You and the user have JUST agreed to go to ${venue} together, but you are NOT there yet. ` +
      `You're at your own place getting ready; the user will head over and meet you there shortly. ` +
      `You're texting while you wait. React directly and substantively to what they say; never give a one-word non-answer.` +
      LOGISTICS_REALISM +
      closeness
    );
  }

  const activity = state.activity ? state.activity : 'taking it easy';
  return (
    `\n\n=== CURRENT SETTING ===\n` +
    `You are at your OWN place, ${activity} (mood: ${state.mood || 'easy'}). ` +
    `You and the user are NOT in the same room — you're texting from a distance. ` +
    `If asked, you are at home doing your own thing, chatting with them remotely.${closeness}`
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
  if (userMessageCount < 6 || (userMessageCount - 2) % 4 !== 0) return false;
  const k = (userMessageCount - 2) / 4;
  return k % 3 === 2;
}

/** Affinity delta for a bill choice: index 0 = user pays, index 1 = character pays. */
export function billAffinity(optionIndex: number): number {
  return optionIndex === 0 ? CHOICE_BILL_PAY_AFFINITY : CHOICE_BILL_LETPAY_AFFINITY;
}
