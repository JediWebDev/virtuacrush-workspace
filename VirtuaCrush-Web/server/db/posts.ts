// Social-feed posts. Two kinds share one table:
//   - per-user dynamic posts (viral-moment shares, goal payoffs): user_id set
//   - curated global posts (synced from the R2 bucket by the posts job):
//     user_id NULL, deduped by source_key, usually with an image
import { pool } from './pool';

export interface CharacterPost {
  id: string;
  text: string;
  createdAt: string;
  imageUrl: string | null;
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

/** Inserts a curated (global) post once per bucket object; reruns are no-ops. */
export async function createCuratedPost(
  characterId: string,
  text: string,
  imageUrl: string,
  sourceKey: string,
): Promise<boolean> {
  const clean = text.trim().slice(0, 280);
  const { rowCount } = await pool.query(
    `INSERT INTO character_posts (user_id, character_id, text, image_url, source_key)
     VALUES (NULL, $1, $2, $3, $4)
     ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING`,
    [characterId, clean || ' ', imageUrl, sourceKey],
  );
  return (rowCount ?? 0) > 0;
}

/** User's own dynamic posts merged with curated global posts, newest first. */
export async function listPosts(
  userId: string,
  characterId: string,
  limit = 20,
): Promise<CharacterPost[]> {
  const { rows } = await pool.query<{ id: string; text: string; created_at: string; image_url: string | null }>(
    `SELECT id, text, created_at, image_url FROM character_posts
     WHERE (user_id = $1 OR user_id IS NULL) AND character_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, characterId, limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    text: r.text,
    createdAt: r.created_at,
    imageUrl: r.image_url ?? null,
  }));
}
