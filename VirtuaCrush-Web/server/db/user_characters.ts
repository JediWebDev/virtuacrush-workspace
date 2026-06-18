// DB layer for user-created characters (Story Studio Phase 2). Private to their
// creator for now; public sharing + moderation come in a later phase.
import { pool } from './pool';
import { buildUserCharacter, registerUserCharacter } from '../inworld/characters';
import { parseVoiceTags, composeVoiceToneBlock, normalizeVoiceTagsInput } from '../studio/schema';

export { normalizeVoiceTagsInput };

export interface UserCharacter {
  id: string;                 // numeric DB id as string
  ownerUserId: string;
  displayName: string;
  core: string;               // personality / system-prompt body
  greeting: string;
  secret: string | null;
  tone: string | null;
  visibility: 'private' | 'public';
  moderationStatus: 'pending' | 'approved' | 'rejected';
  moderationReason: string | null;
  creatorName: string | null;
  sourceId: string | null;    // original id if this is a copy
  copyCount: number;
  imageKey: string | null;    // R2 object key for the avatar; null = initials fallback
  createdAt: string;
}

interface Row {
  id: number; owner_user_id: string; display_name: string; core: string; greeting: string;
  secret: string | null; tone: string | null; visibility: string; moderation_status: string;
  moderation_reason: string | null; creator_name: string | null; source_id: string | number | null;
  copy_count: number | null; image_key: string | null; created_at: string;
}

function rowTo(r: Row): UserCharacter {
  return {
    id: String(r.id),
    ownerUserId: r.owner_user_id,
    displayName: r.display_name,
    core: r.core,
    greeting: r.greeting,
    secret: r.secret,
    tone: r.tone,
    visibility: r.visibility as 'private' | 'public',
    moderationStatus: r.moderation_status as 'pending' | 'approved' | 'rejected',
    moderationReason: r.moderation_reason ?? null,
    creatorName: r.creator_name ?? null,
    sourceId: r.source_id != null ? String(r.source_id) : null,
    copyCount: r.copy_count ?? 0,
    imageKey: r.image_key ?? null,
    createdAt: r.created_at,
  };
}

/** Sets (or clears) the avatar image key for an owned character. */
export async function setCharacterImage(ownerUserId: string, dbId: string, imageKey: string | null): Promise<boolean> {
  const n = Number(dbId);
  if (!Number.isFinite(n)) return false;
  const { rowCount } = await pool.query(
    `UPDATE user_characters SET image_key = $3, updated_at = NOW() WHERE id = $1 AND owner_user_id = $2`,
    [n, ownerUserId, imageKey],
  );
  return (rowCount ?? 0) > 0;
}

/** The chat/character id used everywhere for a custom persona. */
export function userCharacterRef(dbId: string | number): string {
  return `user:${dbId}`;
}
function dbIdFromRef(ref: string): string | null {
  const m = /^user:(\d+)$/.exec(ref);
  return m ? m[1] : null;
}

export async function createUserCharacter(p: {
  ownerUserId: string;
  displayName: string;
  core: string;
  greeting?: string;
  secret?: string | null;
  tone?: string | null;
}): Promise<UserCharacter> {
  const { rows } = await pool.query<Row>(
    `INSERT INTO user_characters (owner_user_id, display_name, core, greeting, secret, tone)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      p.ownerUserId,
      p.displayName.slice(0, 60),
      p.core.slice(0, 4000),
      (p.greeting ?? '').slice(0, 600),
      p.secret ? p.secret.slice(0, 600) : null,
      normalizeVoiceTagsInput(p.tone),
    ],
  );
  return rowTo(rows[0]!);
}

export async function listUserCharacters(ownerUserId: string): Promise<UserCharacter[]> {
  const { rows } = await pool.query<Row>(
    `SELECT * FROM user_characters WHERE owner_user_id = $1 ORDER BY created_at DESC`,
    [ownerUserId],
  );
  return rows.map(rowTo);
}

export async function getUserCharacter(dbId: string): Promise<UserCharacter | null> {
  const n = Number(dbId);
  if (!Number.isFinite(n)) return null;
  const { rows } = await pool.query<Row>(`SELECT * FROM user_characters WHERE id = $1`, [n]);
  return rows[0] ? rowTo(rows[0]) : null;
}

export async function deleteUserCharacter(ownerUserId: string, dbId: string): Promise<boolean> {
  const n = Number(dbId);
  if (!Number.isFinite(n)) return false;
  const { rowCount } = await pool.query(
    `DELETE FROM user_characters WHERE id = $1 AND owner_user_id = $2`,
    [n, ownerUserId],
  );
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Community sharing (Phase 4)
// ---------------------------------------------------------------------------

/** Sets visibility + moderation outcome for an owned character. Returns the
 *  updated row, or null if not found / not owned. */
export async function setCharacterVisibility(
  ownerUserId: string,
  dbId: string,
  p: { visibility: 'private' | 'public'; moderationStatus: 'pending' | 'approved' | 'rejected'; reason?: string | null; creatorName?: string | null },
): Promise<UserCharacter | null> {
  const n = Number(dbId);
  if (!Number.isFinite(n)) return null;
  const goingPublic = p.visibility === 'public' && p.moderationStatus === 'approved';
  const { rows } = await pool.query<Row>(
    `UPDATE user_characters
        SET visibility = $3,
            moderation_status = $4,
            moderation_reason = $5,
            creator_name = COALESCE(creator_name, $6),
            published_at = CASE WHEN $7 THEN NOW() ELSE published_at END,
            updated_at = NOW()
      WHERE id = $1 AND owner_user_id = $2
      RETURNING *`,
    [n, ownerUserId, p.visibility, p.moderationStatus, p.reason ?? null, p.creatorName ?? null, goingPublic],
  );
  return rows[0] ? rowTo(rows[0]) : null;
}

/** Public, approved characters for the community browse (newest first). */
export async function listPublicCharacters(limit = 60): Promise<UserCharacter[]> {
  const { rows } = await pool.query<Row>(
    `SELECT * FROM user_characters
      WHERE visibility = 'public' AND moderation_status = 'approved'
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(rowTo);
}

/** A single public, approved character (for the copy flow). */
export async function getPublicCharacter(dbId: string): Promise<UserCharacter | null> {
  const c = await getUserCharacter(dbId);
  if (!c || c.visibility !== 'public' || c.moderationStatus !== 'approved') return null;
  return c;
}

/** Copies a public character into the requesting user's library (private,
 *  approved, attributed to the original creator). Bumps the source copy_count.
 *  If the user already copied this exact source, returns their existing copy. */
export async function copyCharacterToUser(sourceId: string, newOwnerUserId: string): Promise<UserCharacter | null> {
  const src = await getPublicCharacter(sourceId);
  if (!src) return null;

  const existing = await pool.query<Row>(
    `SELECT * FROM user_characters WHERE owner_user_id = $1 AND source_id = $2 LIMIT 1`,
    [newOwnerUserId, Number(sourceId)],
  );
  if (existing.rows[0]) return rowTo(existing.rows[0]);

  const { rows } = await pool.query<Row>(
    `INSERT INTO user_characters
       (owner_user_id, display_name, core, greeting, secret, tone, visibility, moderation_status, creator_name, source_id, image_key)
     VALUES ($1, $2, $3, $4, $5, $6, 'private', 'approved', $7, $8, $9)
     RETURNING *`,
    [
      newOwnerUserId,
      src.displayName,
      src.core,
      src.greeting,
      src.secret,
      src.tone,
      src.creatorName ?? null,
      Number(sourceId),
      src.imageKey ?? null,
    ],
  );
  await pool.query(`UPDATE user_characters SET copy_count = copy_count + 1 WHERE id = $1`, [Number(sourceId)]);
  return rows[0] ? rowTo(rows[0]) : null;
}

/** Composes the full system-prompt core from the stored persona parts. */
function composeCore(c: UserCharacter): string {
  const tags = parseVoiceTags(c.tone);
  const toneBlock = tags.length ? `\n\n${composeVoiceToneBlock(tags)}` : '';
  return (
    c.core +
    toneBlock +
    (c.secret
      ? `\n\nSECRET: You are quietly hiding this: ${c.secret}. Never volunteer it; only let it surface if the player earns real, sustained trust.`
      : '')
  );
}

/**
 * Loads a custom persona ("user:<id>") from the DB and registers it so the
 * synchronous getCharacter() can resolve it for the rest of the request.
 * Scoped to the owner (private). Returns false if not found / not owned.
 */
export async function ensureUserCharacterLoaded(ref: string, ownerUserId: string): Promise<boolean> {
  const dbId = dbIdFromRef(ref);
  if (!dbId) return false;
  const row = await getUserCharacter(dbId);
  if (!row || row.ownerUserId !== ownerUserId) return false;
  registerUserCharacter(
    buildUserCharacter({
      id: ref,
      displayName: row.displayName,
      greeting: row.greeting || `Oh — hi. I'm ${row.displayName}.`,
      core: composeCore(row),
    }),
  );
  return true;
}
