// DB layer for user-created Story Studio content. Phase 1: stories (arcs) for
// existing characters, private to their creator.
import { pool } from './pool';

export interface UserStory {
  id: string;
  ownerUserId: string;
  characterId: string;        // built-in id (e.g. 'serena') or 'user:<id>'
  title: string;
  blurb: string;
  format: 'arc' | 'pack';
  spec: Record<string, unknown>;
  visibility: 'private' | 'public';
  moderationStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface Row {
  id: number; owner_user_id: string; character_id: string; title: string; blurb: string;
  format: string; spec: Record<string, unknown>; visibility: string; moderation_status: string; created_at: string;
}

function rowToStory(r: Row): UserStory {
  return {
    id: String(r.id),
    ownerUserId: r.owner_user_id,
    characterId: r.character_id,
    title: r.title,
    blurb: r.blurb,
    format: (r.format as 'arc' | 'pack'),
    spec: r.spec,
    visibility: (r.visibility as 'private' | 'public'),
    moderationStatus: (r.moderation_status as 'pending' | 'approved' | 'rejected'),
    createdAt: r.created_at,
  };
}

export async function createUserStory(p: {
  ownerUserId: string;
  characterId: string;
  title: string;
  blurb: string;
  format: 'arc' | 'pack';
  spec: Record<string, unknown>;
}): Promise<UserStory> {
  const { rows } = await pool.query<Row>(
    `INSERT INTO user_stories (owner_user_id, character_id, title, blurb, format, spec)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [p.ownerUserId, p.characterId, p.title.slice(0, 120), p.blurb.slice(0, 400), p.format, JSON.stringify(p.spec)],
  );
  return rowToStory(rows[0]!);
}

/** A user's own stories, optionally filtered to one character, newest first. */
export async function listUserStories(ownerUserId: string, characterId?: string): Promise<UserStory[]> {
  const { rows } = await pool.query<Row>(
    `SELECT * FROM user_stories
      WHERE owner_user_id = $1 ${characterId ? 'AND character_id = $2' : ''}
      ORDER BY created_at DESC`,
    characterId ? [ownerUserId, characterId] : [ownerUserId],
  );
  return rows.map(rowToStory);
}

export async function getUserStory(id: string): Promise<UserStory | null> {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  const { rows } = await pool.query<Row>(`SELECT * FROM user_stories WHERE id = $1`, [n]);
  return rows[0] ? rowToStory(rows[0]) : null;
}

export async function deleteUserStory(ownerUserId: string, id: string): Promise<boolean> {
  const n = Number(id);
  if (!Number.isFinite(n)) return false;
  const { rowCount } = await pool.query(
    `DELETE FROM user_stories WHERE id = $1 AND owner_user_id = $2`,
    [n, ownerUserId],
  );
  return (rowCount ?? 0) > 0;
}
