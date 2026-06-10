// Token-budget helpers. History is the biggest variable input cost per message;
// this keeps the most recent turns verbatim (local coherence) and compresses
// older ones to a snippet (continuity), under a hard total character cap.
// Pure + testable. ~4 chars ≈ 1 token, so the default 2200-char cap is roughly
// 550 tokens of history.

export interface BudgetTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface HistoryBudgetOpts {
  /** Most recent turns kept verbatim. */
  keepFullTail?: number;
  /** Older turns are truncated to this many characters. */
  maxCharsPerOldTurn?: number;
  /** Hard cap on total history characters (oldest dropped first). */
  maxTotalChars?: number;
}

const DEFAULTS: Required<HistoryBudgetOpts> = {
  keepFullTail: 4,
  maxCharsPerOldTurn: 220,
  maxTotalChars: 2200,
};

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  // Cut at a word boundary near the cap so snippets stay readable.
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return `${slice.slice(0, lastSpace > max * 0.6 ? lastSpace : max)}…`;
}

/**
 * Applies the history budget: recent turns verbatim, older turns snipped,
 * oldest dropped entirely once the total cap is hit. Order is preserved.
 */
export function budgetHistory(turns: BudgetTurn[], opts: HistoryBudgetOpts = {}): BudgetTurn[] {
  const { keepFullTail, maxCharsPerOldTurn, maxTotalChars } = { ...DEFAULTS, ...opts };
  if (turns.length === 0) return [];

  const tailStart = Math.max(0, turns.length - keepFullTail);
  const shaped: BudgetTurn[] = turns.map((t, i) => ({
    role: t.role,
    content: i >= tailStart ? t.content.trim() : truncate(t.content, maxCharsPerOldTurn),
  }));

  // Enforce the total cap by dropping from the FRONT (oldest first), but never
  // dropping into the verbatim tail.
  let total = shaped.reduce((n, t) => n + t.content.length, 0);
  let start = 0;
  while (total > maxTotalChars && start < tailStart) {
    total -= shaped[start].content.length;
    start++;
  }
  return shaped.slice(start);
}
