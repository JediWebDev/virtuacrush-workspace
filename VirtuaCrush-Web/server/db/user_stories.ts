// DB layer for user-created Story Studio content: stories (arcs) and CYOA packs
// for built-in or custom characters. Private to their creator unless published.
import { pool } from './pool';
import { getPublicCharacter, copyCharacterToUser } from './user_characters';

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
  moderationReason: string | null;
  creatorName: string | null;
  sourceId: string | null;
  copyCount: number;
  /** 'user' = player-authored in Studio; 'generated' = emergent LLM arc. */
  source: 'user' | 'generated';
  createdAt: string;
}

interface Row {
  id: number; owner_user_id: string; character_id: string; title: string; blurb: string;
  format: string; spec: Record<string, unknown>; visibility: string; moderation_status: string;
  moderation_reason: string | null; creator_name: string | null; source_id: string | number | null;
  copy_count: number | null; source: string | null; created_at: string;
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
    moderationReason: r.moderation_reason ?? null,
    creatorName: r.creator_name ?? null,
    sourceId: r.source_id != null ? String(r.source_id) : null,
    copyCount: r.copy_count ?? 0,
    source: (r.source as 'user' | 'generated') ?? 'user',
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

/** A user's own AUTHORED stories (Studio list), optionally filtered to one
 *  character, newest first. Emergent generated arcs are excluded. */
export async function listUserStories(ownerUserId: string, characterId?: string): Promise<UserStory[]> {
  const { rows } = await pool.query<Row>(
    `SELECT * FROM user_stories
      WHERE owner_user_id = $1 AND source = 'user' ${characterId ? 'AND character_id = $2' : ''}
      ORDER BY created_at DESC`,
    characterId ? [ownerUserId, characterId] : [ownerUserId],
  );
  return rows.map(rowToStory);
}

/** Persists a system-generated emergent arc (private, kept out of the Studio
 *  list). Returns the stored story so it can be activated as `user:<id>`. */
export async function createGeneratedArc(p: {
  ownerUserId: string;
  characterId: string;
  title: string;
  blurb: string;
  spec: Record<string, unknown>;
}): Promise<UserStory> {
  const { rows } = await pool.query<Row>(
    `INSERT INTO user_stories
       (owner_user_id, character_id, title, blurb, format, spec, source, visibility, moderation_status)
     VALUES ($1, $2, $3, $4, 'arc', $5::jsonb, 'generated', 'private', 'approved')
     RETURNING *`,
    [p.ownerUserId, p.characterId, p.title.slice(0, 120), p.blurb.slice(0, 400), JSON.stringify(p.spec)],
  );
  return rowToStory(rows[0]!);
}

export async function getUserStory(id: string): Promise<UserStory | null> {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  const { rows } = await pool.query<Row>(`SELECT * FROM user_stories WHERE id = $1`, [n]);
  return rows[0] ? rowToStory(rows[0]) : null;
}

/** Updates an owned story's metadata and spec (arcs and packs). */
export async function updateUserStory(
  ownerUserId: string,
  id: string,
  p: {
    characterId: string;
    title: string;
    blurb: string;
    spec: Record<string, unknown>;
  },
): Promise<UserStory | null> {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  const { rows } = await pool.query<Row>(
    `UPDATE user_stories
        SET character_id = $3,
            title = $4,
            blurb = $5,
            spec = $6::jsonb
      WHERE id = $1 AND owner_user_id = $2
      RETURNING *`,
    [n, ownerUserId, p.characterId, p.title.slice(0, 120), p.blurb.slice(0, 400), JSON.stringify(p.spec)],
  );
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

// ---------------------------------------------------------------------------
// Community sharing (Phase 4)
// ---------------------------------------------------------------------------

/** Sets visibility + moderation outcome for an owned story. */
export async function setStoryVisibility(
  ownerUserId: string,
  id: string,
  p: { visibility: 'private' | 'public'; moderationStatus: 'pending' | 'approved' | 'rejected'; reason?: string | null; creatorName?: string | null },
): Promise<UserStory | null> {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  const goingPublic = p.visibility === 'public' && p.moderationStatus === 'approved';
  const { rows } = await pool.query<Row>(
    `UPDATE user_stories
        SET visibility = $3,
            moderation_status = $4,
            moderation_reason = $5,
            creator_name = COALESCE(creator_name, $6),
            published_at = CASE WHEN $7 THEN NOW() ELSE published_at END
      WHERE id = $1 AND owner_user_id = $2
      RETURNING *`,
    [n, ownerUserId, p.visibility, p.moderationStatus, p.reason ?? null, p.creatorName ?? null, goingPublic],
  );
  return rows[0] ? rowToStory(rows[0]) : null;
}

/** Public, approved stories of a given format for community browse. */
export async function listPublicStories(format: 'arc' | 'pack', limit = 60): Promise<UserStory[]> {
  const { rows } = await pool.query<Row>(
    `SELECT * FROM user_stories
      WHERE visibility = 'public' AND moderation_status = 'approved' AND format = $1
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT $2`,
    [format, limit],
  );
  return rows.map(rowToStory);
}

export async function getPublicStory(id: string): Promise<UserStory | null> {
  const s = await getUserStory(id);
  if (!s || s.visibility !== 'public' || s.moderationStatus !== 'approved') return null;
  return s;
}

/**
 * Copies a public story (arc or pack) into the requesting user's library
 * (private, approved, attributed). If the story stars a CUSTOM character
 * ("user:<id>"), that character is also copied into the user's library (when
 * it's public) and the copy is repointed at it, so the adventure actually works.
 * Returns the new story, or null if the source isn't public.
 */
export async function copyStoryToUser(sourceId: string, newOwnerUserId: string): Promise<UserStory | null> {
  const src = await getPublicStory(sourceId);
  if (!src) return null;

  const existing = await pool.query<Row>(
    `SELECT * FROM user_stories WHERE owner_user_id = $1 AND source_id = $2 LIMIT 1`,
    [newOwnerUserId, Number(sourceId)],
  );
  if (existing.rows[0]) return rowToStory(existing.rows[0]);

  // Resolve the character: a custom companion must be copied too so the new
  // owner actually owns the persona the story references.
  let characterId = src.characterId;
  if (characterId.startsWith('user:')) {
    const refId = characterId.slice('user:'.length);
    const pub = await getPublicCharacter(refId);
    if (pub) {
      const copied = await copyCharacterToUser(refId, newOwnerUserId);
      if (copied) characterId = `user:${copied.id}`;
    }
    // If the referenced character isn't public, the story is copied as-is; it
    // simply won't resolve a custom persona (falls back to generic lore).
  }

  const { rows } = await pool.query<Row>(
    `INSERT INTO user_stories
       (owner_user_id, character_id, title, blurb, format, spec, visibility, moderation_status, creator_name, source_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'private', 'approved', $7, $8)
     RETURNING *`,
    [
      newOwnerUserId,
      characterId,
      src.title,
      src.blurb,
      src.format,
      JSON.stringify(src.spec),
      src.creatorName ?? null,
      Number(sourceId),
    ],
  );
  await pool.query(`UPDATE user_stories SET copy_count = copy_count + 1 WHERE id = $1`, [Number(sourceId)]);
  return rows[0] ? rowToStory(rows[0]) : null;
}
