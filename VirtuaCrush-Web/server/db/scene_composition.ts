// Persistence + staleness policy for composed scenes. The composer itself is
// pure (server/sim/scene_composer.ts); this layer decides WHEN to recompose:
// new sim day, phase change, venue change, or an 8-hour age-out — otherwise the
// stored composition is reused so the scene stays stable within a session.
import { pool } from './pool';
import { utcDateString } from './story_util';
import { scenePhase } from './scene_util';
import type { Situation } from './state';
import {
  composeScene,
  type SceneComposition,
} from '../sim/scene_composer';
import { hashSeed } from '../sim/scene_registry';

export { renderSceneHeader, renderSceneFactsBlock } from '../sim/scene_composer';
export type { SceneComposition } from '../sim/scene_composer';

const MAX_AGE_MS = 8 * 3_600_000;

/**
 * Returns the active scene composition for this user/character, composing and
 * persisting a new one when stale. Returns null while jailed (the jail
 * narrator owns that scene). Never throws on the persistence write.
 */
export async function getOrComposeScene(
  userId: string,
  characterId: string,
  displayName: string,
  situation: Situation,
): Promise<SceneComposition | null> {
  const phase = scenePhase(situation.scene);
  if (phase === 'jailed') return null;

  // Stranger switch: it stays a "first meeting" until the user has sent their
  // first message ever to this character. (The hand-written greeting is an
  // assistant row, so merely opening the chat doesn't flip it — replying does.)
  const { rows: metRows } = await pool.query(
    `SELECT 1 FROM chat_messages WHERE user_id = $1 AND character_id = $2 AND role = 'user' LIMIT 1`,
    [userId, characterId],
  );
  const firstMeeting = metRows.length === 0;

  const today = utcDateString();
  const target = phase === 'on_date' ? situation.scene.location : null;

  const { rows } = await pool.query<{ scene_composition: SceneComposition | null }>(
    `SELECT scene_composition FROM character_state WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId],
  );
  const existing = rows[0]?.scene_composition ?? null;
  const fresh =
    existing &&
    existing.forDate === today &&
    existing.phase === phase &&
    (existing.locationSlug ?? null) === (target ?? null) &&
    Date.now() - new Date(existing.composedAt).getTime() < MAX_AGE_MS &&
    // A meet-cute composition stays valid through the whole first session even
    // after the user's first message flips the stranger switch; but a normal
    // composition can never satisfy a wanted first meeting.
    (Boolean(existing.firstMeeting) === firstMeeting || existing.firstMeeting === true);
  if (fresh) return existing;

  const now = new Date();
  // Seed buckets the day into 8h windows so a morning visit and a late-night
  // visit compose different scenes, but refreshes within a window are stable.
  const composed = composeScene({
    characterId,
    displayName,
    phase,
    scene: situation.scene,
    state: situation.state,
    now,
    forDate: today,
    firstMeeting,
    seed: hashSeed(
      `${userId}:${characterId}:${today}:${phase}:${target ?? ''}:${Math.floor(now.getHours() / 8)}${firstMeeting ? ':first' : ''}`,
    ),
  });

  await pool
    .query(
      `UPDATE character_state SET scene_composition = $3::jsonb, updated_at = NOW()
       WHERE user_id = $1 AND character_id = $2`,
      [userId, characterId, JSON.stringify(composed)],
    )
    .catch((e) => console.warn('[scene] composition persist failed:', e));

  return composed;
}

/** Records a fired disruption id on the stored composition. */
export async function markDisruptionFired(
  userId: string,
  characterId: string,
  id: string,
): Promise<void> {
  await pool.query(
    `UPDATE character_state
       SET scene_composition = jsonb_set(
         COALESCE(scene_composition, '{}'::jsonb),
         '{firedDisruptions}',
         COALESCE(scene_composition->'firedDisruptions', '[]'::jsonb) || to_jsonb($3::text)
       )
     WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId, id],
  );
}
