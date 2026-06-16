// DB layer for user-created characters (Story Studio Phase 2). Private to their
// creator for now; public sharing + moderation come in a later phase.
import { pool } from './pool';
import { buildUserCharacter, registerUserCharacter } from '../inworld/characters';

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
  createdAt: string;
}

interface Row {
  id: number; owner_user_id: string; display_name: string; core: string; greeting: string;
  secret: string | null; tone: string | null; visibility: string; moderation_status: string; created_at: string;
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
    createdAt: r.created_at,
  };
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
      p.tone ? p.tone.slice(0, 60) : null,
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

/** Composes the full system-prompt core from the stored persona parts. */
function composeCore(c: UserCharacter): string {
  return (
    c.core +
    (c.tone ? `\n\nVOICE & TONE: ${c.tone}` : '') +
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
