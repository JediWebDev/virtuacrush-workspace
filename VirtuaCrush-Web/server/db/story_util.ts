// Pure, dependency-free helpers for the story engine: parsing the LLM's
// daily-state JSON, clamping progress, deterministic offline fallback, staleness
// checks, and prompt formatting. No DB or native runtime imports, so these are
// unit-testable anywhere.

export interface DailyState {
  activity: string;
  mood: string;
  headline: string;
  goalProgress: number; // 0..100
}

/** A generated state plus how much progress the day added (pre-clamp). */
export interface GeneratedState {
  activity: string;
  mood: string;
  headline: string;
  goalDelta: number;
}

export const MAX_GOAL_PROGRESS = 100;
/** Cap on a single day's progress so the goal can't be trivially maxed. */
export const MAX_DAILY_GOAL_DELTA = 15;

/** Clamps a number into [min, max], returning fallback for non-finite input. */
export function clamp(n: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** UTC date string (YYYY-MM-DD) for a given Date (defaults to now). */
export function utcDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A stored row's state_date is "stale" when it's not today's UTC date — meaning
 * the day rolled over and the storyline should advance.
 */
export function isStale(
  stateDate: string | Date | null | undefined,
  today: string = utcDateString(),
): boolean {
  if (!stateDate) return true;
  // node-postgres returns DATE columns as JS Date objects; normalize both a Date
  // and a "YYYY-MM-DD..." string down to a YYYY-MM-DD day for comparison.
  const d =
    stateDate instanceof Date ? stateDate.toISOString().slice(0, 10) : String(stateDate).slice(0, 10);
  return d !== today;
}

/** Parses the LLM daily-state response into a GeneratedState, or null if unusable. */
export function parseGeneratedState(
  raw: string | { text?: string; content?: string },
): GeneratedState | null {
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
  if (!obj || typeof obj !== 'object') return null;

  const activity = typeof obj.activity === 'string' ? obj.activity.trim() : '';
  if (!activity) return null;

  const mood = typeof obj.mood === 'string' && obj.mood.trim() ? obj.mood.trim() : 'focused';
  const headline =
    typeof obj.headline === 'string' && obj.headline.trim() ? obj.headline.trim() : activity;
  const goalDeltaRaw =
    typeof obj.goalDelta === 'number'
      ? obj.goalDelta
      : typeof obj.goalDelta === 'string'
        ? parseFloat(obj.goalDelta)
        : 0;
  const goalDelta = clamp(Math.round(goalDeltaRaw), 0, MAX_DAILY_GOAL_DELTA, 0);

  return {
    activity: activity.slice(0, 280),
    mood: mood.slice(0, 60),
    headline: headline.slice(0, 120),
    goalDelta,
  };
}

/**
 * Deterministic offline fallback when the LLM is unavailable. Picks an activity
 * seed by day so it's stable within a day but rotates over time. Adds no goal
 * progress (we don't fabricate story advancement without the model).
 */
export function fallbackGeneratedState(seeds: string[], today: string = utcDateString()): GeneratedState {
  const pool = seeds.length > 0 ? seeds : ['going about their day'];
  // Simple stable hash of the date -> index.
  let h = 0;
  for (let i = 0; i < today.length; i++) h = (h * 31 + today.charCodeAt(i)) >>> 0;
  const activity = pool[h % pool.length];
  return { activity, mood: 'focused', headline: activity, goalDelta: 0 };
}

/** Applies a day's generated result to the prior progress, clamped to [0,100]. */
export function advanceProgress(priorProgress: number, goalDelta: number): number {
  const base = clamp(priorProgress, 0, MAX_GOAL_PROGRESS, 0);
  return clamp(base + clamp(goalDelta, 0, MAX_DAILY_GOAL_DELTA, 0), 0, MAX_GOAL_PROGRESS, base);
}

/**
 * Formats the current state into a system-prompt block so chat replies stay
 * consistent with what the character is "doing" right now. Returns '' if empty.
 */
export function formatStateBlock(state: DailyState | null | undefined): string {
  if (!state || !state.activity) return '';
  return (
    `\n\nWHAT YOU ARE DOING RIGHT NOW (your real-time situation — let it color your mood; mention it naturally only if it fits):\n` +
    `- Currently: ${state.activity}\n` +
    `- Mood: ${state.mood}`
  );
}
