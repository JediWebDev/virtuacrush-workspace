// D&D-style skill checks for free-roam chat.
//
// When the player attempts something absurd, risky, or wildly off-track, the
// director (DM) can flag a skill check. The client then rolls a d20; the engine
// — not the model — decides success (roll >= DC) and hands the outcome back to
// the narrator to play out. All parsing is fail-soft: a malformed skillCheck
// simply means "no check this turn".

export type CheckDifficulty =
  | 'trivial'
  | 'easy'
  | 'medium'
  | 'hard'
  | 'formidable';

/** Target number the player must meet or beat on a d20 for each difficulty. */
export const DC_BY_DIFFICULTY: Record<CheckDifficulty, number> = {
  trivial: 5,
  easy: 8,
  medium: 12,
  hard: 16,
  formidable: 19,
};

const VALID_DIFFICULTIES = new Set<string>(Object.keys(DC_BY_DIFFICULTY));

/** A dungeon-master skill check the player must roll to resolve. */
export interface SkillCheck {
  /** Short description of what the player is attempting, in their voice. */
  action: string;
  difficulty: CheckDifficulty;
  /** Target number to meet or beat (derived from difficulty). */
  dc: number;
  /** Optional one-line reason the DM called for a roll (flavor). */
  reason: string;
}

/** The resolved result of a d20 roll against a check. */
export interface RollOutcome {
  action: string;
  /** The d20 face value, 1–20. */
  roll: number;
  dc: number;
  success: boolean;
  /** Natural-20 auto-success / natural-1 auto-fail flavor flags. */
  crit: boolean;
  fumble: boolean;
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Parses a `skillCheck` field from the director's JSON, fail-soft.
 * Returns null unless it names a concrete action AND a valid difficulty and is
 * explicitly required (required !== false). Derives the DC from the difficulty
 * so the model never has to invent a target number.
 */
export function parseSkillCheck(raw: unknown): SkillCheck | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  // Treat missing `required` as true (presence of the object implies a check),
  // but honor an explicit `false`.
  if (o.required === false) return null;

  const action = asStr(o.action);
  if (!action || action.toLowerCase() === 'null') return null;

  const diff = asStr(o.difficulty).toLowerCase();
  if (!VALID_DIFFICULTIES.has(diff)) return null;
  const difficulty = diff as CheckDifficulty;

  return {
    action: action.slice(0, 160),
    difficulty,
    dc: DC_BY_DIFFICULTY[difficulty],
    reason: asStr(o.reason).slice(0, 200),
  };
}

/** Clamps an arbitrary number to a valid d20 face (1–20); NaN -> 1. */
export function clampD20(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(20, Math.max(1, n));
}

/**
 * Engine-authoritative resolution. Natural 20 always succeeds, natural 1 always
 * fails; otherwise meet-or-beat the DC.
 */
export function resolveRoll(action: string, roll: number, dc: number): RollOutcome {
  const face = clampD20(roll);
  const target = Number.isFinite(dc) ? dc : DC_BY_DIFFICULTY.medium;
  const crit = face === 20;
  const fumble = face === 1;
  const success = crit ? true : fumble ? false : face >= target;
  return { action: action.slice(0, 160), roll: face, dc: target, success, crit, fumble };
}

/**
 * Validates a roll payload from the client and resolves it engine-side.
 * Returns null unless it carries a concrete action and finite numbers, so a
 * malformed roll simply falls back to a normal chat turn.
 */
export function parseRollRequest(raw: unknown): RollOutcome | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const action = asStr(o.action);
  if (!action) return null;
  const value = Number(o.value);
  const dc = Number(o.dc);
  if (!Number.isFinite(value) || !Number.isFinite(dc)) return null;
  return resolveRoll(action, value, dc);
}

/**
 * Builds the resolution directive injected into the director prompt on the turn
 * AFTER a roll. It tells the narrator exactly what happened and forbids asking
 * for another roll, so the check resolves in a single follow-up beat.
 */
export function formatRollResolutionDirective(outcome: RollOutcome, playerName?: string): string {
  const who = playerName?.trim() ? playerName.trim() : 'The player';
  const verdict = outcome.crit
    ? 'a CRITICAL SUCCESS (natural 20)'
    : outcome.fumble
      ? 'a CRITICAL FAILURE (natural 1)'
      : outcome.success
        ? 'a SUCCESS'
        : 'a FAILURE';
  const guidance = outcome.success
    ? `Narrate the attempt working out. ${outcome.crit ? 'It goes even better than hoped — lean into the spectacle.' : 'Let it land, within reason.'}`
    : `Narrate the attempt going wrong in a vivid, in-character way. ${outcome.fumble ? 'Make the misfire memorable and a little humiliating (but never cruel).' : 'It fails, with consequences that keep the scene moving.'}`;
  return (
`=== DICE RESOLUTION (engine-authoritative — obey exactly) ===
${who} attempted: "${outcome.action}".
They rolled ${outcome.roll} against difficulty ${outcome.dc} — ${verdict}.
${guidance}
Do NOT request another roll this turn and do NOT emit a "skillCheck". Play out the result now.`
  );
}
