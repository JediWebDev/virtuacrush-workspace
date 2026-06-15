// DB layer for story pack sessions.
import { pool } from './pool';

export interface PackSessionRow {
  id: number;
  userId: string;
  characterId: string;
  packId: string;
  currentNode: string;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: Date;
  completedAt: Date | null;
}

export async function createPackSession(
  userId: string,
  characterId: string,
  packId: string,
): Promise<PackSessionRow> {
  // Abandon any prior active session for this (user, character) before starting a new one.
  await pool.query(
    `UPDATE pack_sessions SET status = 'abandoned'
     WHERE user_id = $1 AND character_id = $2 AND status = 'active'`,
    [userId, characterId],
  );
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
     ORDER BY created_at DESC
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
}): PackSessionRow {
  return {
    id: r.id,
    userId: r.user_id,
    characterId: r.character_id,
    packId: r.pack_id,
    currentNode: r.current_node,
    status: r.status as PackSessionRow['status'],
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}
