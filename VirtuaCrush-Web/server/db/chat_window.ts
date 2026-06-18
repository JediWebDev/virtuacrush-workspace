/** Free-roam chat window: today's messages, or arc-scoped when a story arc is active. */
import { getArcState } from './arc_state';

export interface FreeRoamWindow {
  /** When set, only messages at/after this timestamp are visible in live free roam. */
  since: Date | null;
  /** When true (and since is null), only today's calendar-day messages are live. */
  todayOnly: boolean;
}

export async function resolveFreeRoamWindow(userId: string, characterId: string): Promise<FreeRoamWindow> {
  const arcState = await getArcState(userId, characterId);
  if (arcState.currentArcId && arcState.activeArcStartedAt) {
    return { since: arcState.activeArcStartedAt, todayOnly: false };
  }
  return { since: null, todayOnly: true };
}

/** SQL fragment + bind values appended after user_id / character_id params. */
export function freeRoamWindowClause(
  window: FreeRoamWindow,
  startParamIndex: number,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const parts: string[] = [];
  if (window.since) {
    parts.push(`created_at >= $${startParamIndex + params.length}`);
    params.push(window.since);
  }
  if (window.todayOnly) {
    parts.push('created_at::date = CURRENT_DATE');
  }
  return {
    sql: parts.length ? ` AND ${parts.join(' AND ')}` : '',
    params,
  };
}
