// The per-user world clock + activity-log (world_events) store. Thin DB layer.
import { pool } from './pool';

export interface WorldClock { simMinutes: number; updatedAt: Date }

export async function getWorldClock(userId: string): Promise<WorldClock> {
  const { rows } = await pool.query<{ sim_minutes: string; updated_at: Date }>(
    `SELECT sim_minutes, updated_at FROM world_clock WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]) return { simMinutes: 0, updatedAt: new Date(0) };
  return { simMinutes: Number(rows[0].sim_minutes) || 0, updatedAt: new Date(rows[0].updated_at) };
}

export async function setWorldClock(userId: string, simMinutes: number): Promise<void> {
  await pool.query(
    `INSERT INTO world_clock (user_id, sim_minutes, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET sim_minutes = $2, updated_at = NOW()`,
    [userId, Math.round(simMinutes)],
  );
}

export interface WorldEventRow { id: string; atMin: number; kind: string; actors: string[]; text: string; createdAt: string }

export async function listWorldEvents(userId: string, limit = 40): Promise<WorldEventRow[]> {
  const { rows } = await pool.query<{ id: string; at_min: string; kind: string; actors: unknown; text: string; created_at: string }>(
    `SELECT id, at_min, kind, actors, text, created_at FROM world_events
     WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    atMin: Number(r.at_min) || 0,
    kind: r.kind,
    actors: Array.isArray(r.actors) ? (r.actors as string[]) : [],
    text: r.text,
    createdAt: r.created_at,
  }));
}

const TURN_MINUTES = 8;

/** Advance sim clock and append a world-event log entry. */
export async function recordWorldChaosEvent(
  userId: string,
  kind: string,
  actors: string[],
  text: string,
): Promise<void> {
  const clock = await getWorldClock(userId);
  const atMin = clock.simMinutes + TURN_MINUTES;
  await pool.query(
    `INSERT INTO world_events (user_id, at_min, kind, actors, text, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW())`,
    [userId, atMin, kind, JSON.stringify(actors), text.slice(0, 500)],
  );
  await setWorldClock(userId, atMin);
}
