// Unified achievements ledger (display + sharing). Arc completions also live in
// arc_completions for gating; this is the player-facing record covering arc
// completions, affinity tiers, secret reveals, and relationship beats.
import { pool } from './pool';

export type AchievementKind = 'arc' | 'affinity' | 'secret' | 'beat';

export interface AchievementInput {
  kind: AchievementKind;
  /** Dedupe key, unique within (user, character). e.g. 'arc:serena_secret_dream', 'affinity:50', 'secret', 'beat:contact_swap'. */
  key: string;
  title: string;
  description: string;
  tone?: string | null;
}

export interface AchievementRecord {
  characterId: string;
  kind: AchievementKind;
  key: string;
  title: string;
  description: string;
  tone: string | null;
  earnedAt: string;
}

/**
 * Records an achievement. Idempotent on (user, character, key) — returns the
 * newly-created record, or null if it already existed (so callers only toast
 * genuinely new milestones). Never throws on the dedupe path.
 */
export async function recordAchievement(
  userId: string,
  characterId: string,
  a: AchievementInput,
): Promise<AchievementRecord | null> {
  const { rows } = await pool.query<{
    kind: AchievementKind;
    ach_key: string;
    title: string;
    description: string;
    tone: string | null;
    earned_at: string;
  }>(
    `INSERT INTO achievements (user_id, character_id, kind, ach_key, title, description, tone)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, character_id, ach_key) DO NOTHING
     RETURNING kind, ach_key, title, description, tone, earned_at`,
    [userId, characterId, a.kind, a.key, a.title, a.description, a.tone ?? null],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    characterId,
    kind: r.kind,
    key: r.ach_key,
    title: r.title,
    description: r.description,
    tone: r.tone,
    earnedAt: r.earned_at,
  };
}

/** All achievements for a user, newest first (caller groups by character). */
export async function listAchievements(userId: string): Promise<AchievementRecord[]> {
  const { rows } = await pool.query<{
    character_id: string;
    kind: AchievementKind;
    ach_key: string;
    title: string;
    description: string;
    tone: string | null;
    earned_at: string;
  }>(
    `SELECT character_id, kind, ach_key, title, description, tone, earned_at
       FROM achievements
      WHERE user_id = $1
      ORDER BY earned_at DESC, id DESC`,
    [userId],
  );
  return rows.map((r) => ({
    characterId: r.character_id,
    kind: r.kind,
    key: r.ach_key,
    title: r.title,
    description: r.description,
    tone: r.tone,
    earnedAt: r.earned_at,
  }));
}
