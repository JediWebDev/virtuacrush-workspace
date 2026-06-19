// DB layer for story pack sessions.
import { pool } from './pool';
import { readSceneSnapshot, writeSceneSnapshot, type SceneSnapshot } from '../inworld/scene_snapshot';

export interface PackSessionRow {
  id: number;
  userId: string;
  characterId: string;
  packId: string;
  currentNode: string;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: Date;
  completedAt: Date | null;
  /** Rolling "scene so far" snapshot for continuity beyond the recent window. */
  sceneState: string;
  sceneSnapshot: SceneSnapshot | null;
}

export async function createPackSession(
  userId: string,
  characterId: string,
  packId: string,
): Promise<PackSessionRow> {
  // NOTE: We intentionally do NOT auto-abandon prior active sessions here.
  // The one-active-story-per-character guardrail is enforced at the route
  // layer (POST /api/packs/:id/start), which refuses to start a new story
  // while another is still active. See routes/packs.ts.
  const { rows } = await pool.query<{
    id: number; user_id: string; character_id: string; pack_id: string;
    current_node: string; status: string; started_at: Date; completed_at: Date | null;
  }>(
    `INSERT INTO pack_sessions (user_id, character_id, pack_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, characterId, packId],
  );
  const r = rows[0]!;
  return rowToSession(r);
}

export async function getPackSession(sessionId: number): Promise<PackSessionRow | null> {
  const { rows } = await pool.query<{
    id: number; user_id: string; character_id: string; pack_id: string;
    current_node: string; status: string; started_at: Date; completed_at: Date | null;
    scene_state: string | null;
  }>(
    `SELECT * FROM pack_sessions WHERE id = $1`,
    [sessionId],
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function getActivePackSession(
  userId: string,
  characterId: string,
): Promise<PackSessionRow | null> {
  const { rows } = await pool.query<{
    id: number; user_id: string; character_id: string; pack_id: string;
    current_node: string; status: string; started_at: Date; completed_at: Date | null;
  }>(
    `SELECT * FROM pack_sessions
     WHERE user_id = $1 AND character_id = $2 AND status = 'active'
     ORDER BY started_at DESC
     LIMIT 1`,
    [userId, characterId],
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function updatePackNode(
  sessionId: number,
  currentNode: string,
): Promise<void> {
  await pool.query(
    `UPDATE pack_sessions SET current_node = $1 WHERE id = $2`,
    [currentNode, sessionId],
  );
}

export async function completePackSession(sessionId: number): Promise<void> {
  await pool.query(
    `UPDATE pack_sessions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [sessionId],
  );
}

export async function abandonPackSession(sessionId: number): Promise<void> {
  await pool.query(
    `UPDATE pack_sessions SET status = 'abandoned' WHERE id = $1`,
    [sessionId],
  );
}

export interface CompletedPackStory {
  sessionId: number;
  packId: string;
  completedAt: Date | null;
  lastLine: string | null;
}

/**
 * Completed story sessions for a (user, character), most recent first, each with
 * its final narrated/spoken line for a history preview.
 */
export async function getCompletedPackSessions(
  userId: string,
  characterId: string,
): Promise<CompletedPackStory[]> {
  const { rows } = await pool.query<{
    id: number; pack_id: string; completed_at: Date | null; last_line: string | null;
  }>(
    `SELECT s.id, s.pack_id, s.completed_at,
            (SELECT content FROM chat_messages m
              WHERE m.pack_session_id = s.id
              ORDER BY m.created_at DESC, m.id DESC
              LIMIT 1) AS last_line
       FROM pack_sessions s
      WHERE s.user_id = $1 AND s.character_id = $2 AND s.status = 'completed'
      ORDER BY s.completed_at DESC NULLS LAST, s.id DESC`,
    [userId, characterId],
  );
  return rows.map((r) => ({
    sessionId: r.id,
    packId: r.pack_id,
    completedAt: r.completed_at,
    lastLine: r.last_line,
  }));
}

export async function countPackMessages(sessionId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM chat_messages WHERE pack_session_id = $1`,
    [sessionId],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

export async function loadPackMessages(
  sessionId: number,
  limit = 30,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const { rows } = await pool.query<{ role: 'user' | 'assistant'; content: string }>(
    `SELECT role, content FROM chat_messages
     WHERE pack_session_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [sessionId, limit],
  );
  return rows.reverse();
}

export async function persistPackTurn(
  userId: string,
  characterId: string,
  sessionId: number,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO chat_messages (user_id, character_id, role, content, pack_session_id)
       VALUES ($1, $2, 'user', $3, $4)`,
      [userId, characterId, userMessage, sessionId],
    );
    await client.query(
      `INSERT INTO chat_messages (user_id, character_id, role, content, pack_session_id)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [userId, characterId, assistantMessage, sessionId],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function rowToSession(r: {
  id: number; user_id: string; character_id: string; pack_id: string;
  current_node: string; status: string; started_at: Date; completed_at: Date | null;
  scene_state?: string;
  scene_snapshot?: unknown;
}): PackSessionRow {
  const snapRaw = r.scene_snapshot;
  const sceneSnapshot =
    snapRaw && typeof snapRaw === 'object' && Object.keys(snapRaw as object).length
      ? readSceneSnapshot({ sceneSnapshot: snapRaw })
      : null;
  return {
    id: r.id,
    userId: r.user_id,
    characterId: r.character_id,
    packId: r.pack_id,
    currentNode: r.current_node,
    status: r.status as PackSessionRow['status'],
    startedAt: r.started_at,
    completedAt: r.completed_at,
    sceneState: r.scene_state ?? '',
    sceneSnapshot,
  };
}

export async function updatePackSceneState(sessionId: number, sceneState: string): Promise<void> {
  await pool.query(
    `UPDATE pack_sessions SET scene_state = $1 WHERE id = $2`,
    [sceneState.slice(0, 1200), sessionId],
  );
}

export async function updatePackSceneContinuity(
  sessionId: number,
  snapshot: SceneSnapshot,
  sceneState: string,
): Promise<void> {
  await pool.query(
    `UPDATE pack_sessions SET scene_state = $1, scene_snapshot = $2::jsonb WHERE id = $3`,
    [sceneState.slice(0, 1200), JSON.stringify(writeSceneSnapshot(snapshot)), sessionId],
  );
}
