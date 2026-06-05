// Pure, dependency-free helpers for timed dialogue choices: parsing/validating
// the LLM-generated choice, deciding when one is due, and computing the
// server-authoritative effects of each option. No DB or runtime imports.

import type { Incident } from './world_util';

/** How long the user has to respond, in seconds (the hourglass duration). */
export const CHOICE_TTL_SECONDS = 60;

// Server-authoritative effects (we never trust LLM-provided numbers).
export const CHOICE_ADVANCE_AFFINITY = 2; // picking the goal-advancing option
export const CHOICE_ADVANCE_GOAL = 8; // goal_progress added when advancing
export const CHOICE_NEUTRAL_AFFINITY = 0.5; // the softer/divergent option
export const CHOICE_NEUTRAL_GOAL = 0;
export const CHOICE_TIMEOUT_AFFINITY = -1; // disengagement penalty on timeout

export const DEFAULT_TIMEOUT_REACTION = '*sighs and turns away*';

export interface BillItem {
  label: string;
  amount: number;
}

export interface BillData {
  items: BillItem[];
  total: number;
}

export interface ChoiceOption {
  label: string;
  advancesGoal: boolean;
  reaction: string;
  post?: string;     // social-post text when this option advances the goal
  location?: string; // venue slug to move the scene to (date choices)
}

export interface GeneratedChoice {
  prompt: string;
  options: [ChoiceOption, ChoiceOption];
  timeoutReaction: string;
}

function cleanStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Parses + validates the LLM choice JSON. Requires a prompt and EXACTLY two
 * options each with a non-empty label and reaction. Returns null if unusable so
 * the caller simply doesn't offer a choice (fail-soft).
 */
export function parseGeneratedChoice(
  raw: string | { text?: string; content?: string },
): GeneratedChoice | null {
  const text = typeof raw === 'string' ? raw : (raw?.content ?? raw?.text ?? '');
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let obj: any;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.options)) return null;

  const prompt = cleanStr(obj.prompt, 400);
  if (!prompt) return null;
  if (obj.options.length !== 2) return null;

  const opts = obj.options.map((o: any): ChoiceOption | null => {
    const label = cleanStr(o?.label, 80);
    const reaction = cleanStr(o?.reaction, 400);
    if (!label || !reaction) return null;
    const advancesGoal = o?.advancesGoal === true;
    const post = cleanStr(o?.post, 280);
    const location = cleanStr(o?.location, 40);
    return { label, advancesGoal, reaction, post: post || undefined, location: location || undefined };
  });
  if (opts.some((o: ChoiceOption | null) => o === null)) return null;

  const timeoutReaction = cleanStr(obj.timeoutReaction, 200) || DEFAULT_TIMEOUT_REACTION;
  return { prompt, options: [opts[0], opts[1]] as [ChoiceOption, ChoiceOption], timeoutReaction };
}

/**
 * Whether a choice should be offered given how many user messages this
 * user/character pair has exchanged. Tuned for an early hook then steady cadence:
 * fires at the 2nd message, then every 4th (6, 10, 14, ...).
 */
export function isChoiceDue(userMessageCount: number): boolean {
  if (userMessageCount < 2) return false;
  if (userMessageCount === 2) return true;
  return userMessageCount > 2 && (userMessageCount - 2) % 4 === 0;
}

/** Server-authoritative affinity/goal effects for selecting an option. */
export function effectsForOption(advancesGoal: boolean): {
  affinityDelta: number;
  goalDelta: number;
} {
  return advancesGoal
    ? { affinityDelta: CHOICE_ADVANCE_AFFINITY, goalDelta: CHOICE_ADVANCE_GOAL }
    : { affinityDelta: CHOICE_NEUTRAL_AFFINITY, goalDelta: CHOICE_NEUTRAL_GOAL };
}

/** Computes an absolute expiry timestamp from a creation time. */
export function expiryFrom(createdAtMs: number, ttlSeconds = CHOICE_TTL_SECONDS): number {
  return createdAtMs + ttlSeconds * 1000;
}

/** Whether a deadline has passed (server-authoritative timeout check). */
export function isExpired(expiresAtMs: number, nowMs: number = Date.now()): boolean {
  return nowMs >= expiresAtMs;
}

/**
 * Engine-authoritative end-date bill: a base venue price plus a deterministic
 * line item for each recorded incident. The LLM never decides these numbers.
 */
export function buildBill(
  venueLabel: string,
  basePrice: number,
  incidents: Incident[] = [],
): BillData {
  const round = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
  const items: BillItem[] = [];
  if (basePrice > 0) items.push({ label: `${venueLabel} for two`, amount: round(basePrice) });
  for (const inc of incidents) {
    if (inc && inc.amount > 0) items.push({ label: inc.label, amount: round(inc.amount) });
  }
  if (items.length === 0) items.push({ label: venueLabel, amount: round(basePrice) });
  const total = round(items.reduce((sum, it) => sum + it.amount, 0));
  return { items, total };
}

