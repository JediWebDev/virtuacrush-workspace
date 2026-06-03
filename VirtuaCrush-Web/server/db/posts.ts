// Dynamic social-feed posts created when a dialogue choice advances a
// character's goal. Merged ahead of the static feed in the UI.
import { pool } from './pool';

export interface CharacterPost {
  id: string;
  text: string;
  createdAt: string;
}

export async function createPost(
  userId: string,
  characterId: string,
  text: string,
): Promise<void> {
  const clean = text.trim().slice(0, 280);
  if (!clean) return;
  await pool.query(
    `INSERT INTO character_posts (user_id, character_id, text) VALUES ($1, $2, $3)`,
    [userId, characterId, clean],
  );
}

export async function listPosts(
  userId: string,
  characterId: string,
  limit = 20,
): Promise<CharacterPost[]> {
  const { rows } = await pool.query<{ id: string; text: string; created_at: string }>(
    `SELECT id, text, created_at FROM character_posts
     WHERE user_id = $1 AND character_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, characterId, limit],
  );
  return rows.map((r) => ({ id: String(r.id), text: r.text, createdAt: r.created_at }));
}
