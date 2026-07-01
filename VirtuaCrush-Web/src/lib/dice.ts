// Client-side dice helpers for DM skill checks. The server is authoritative for
// narration, but the client rolls the d20 (for the animation) and computes the
// same success/fail so the UI can react instantly.

export type CheckDifficulty =
  | 'trivial'
  | 'easy'
  | 'medium'
  | 'hard'
  | 'formidable';

/** A pending skill check handed down from the narrator (mirrors the server type). */
export interface SkillCheck {
  action: string;
  difficulty: CheckDifficulty;
  dc: number;
  reason: string;
}

export const DIFFICULTY_LABEL: Record<CheckDifficulty, string> = {
  trivial: 'Trivial',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  formidable: 'Formidable',
};

/** Rolls a fair d20 (1–20). */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

export interface RollResult {
  value: number;
  dc: number;
  success: boolean;
  /** Natural 20 — auto-success. */
  crit: boolean;
  /** Natural 1 — auto-fail. */
  fumble: boolean;
}

/** Same rule the engine uses: nat-20 always succeeds, nat-1 always fails. */
export function resolveClientRoll(value: number, dc: number): RollResult {
  const crit = value === 20;
  const fumble = value === 1;
  const success = crit ? true : fumble ? false : value >= dc;
  return { value, dc, success, crit, fumble };
}

/** Narrow an unknown payload (e.g. from SSE) into a SkillCheck, or null. */
export function asSkillCheck(raw: unknown): SkillCheck | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const action = typeof o.action === 'string' ? o.action.trim() : '';
  const dc = Number(o.dc);
  const difficulty = String(o.difficulty) as CheckDifficulty;
  if (!action || !Number.isFinite(dc) || !(difficulty in DIFFICULTY_LABEL)) return null;
  return {
    action,
    difficulty,
    dc,
    reason: typeof o.reason === 'string' ? o.reason.trim() : '',
  };
}
