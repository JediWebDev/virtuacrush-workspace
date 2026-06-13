// Jail bail flow: the user's one phone call to ask the date character for bail.
import { pool } from './pool';
import { getScene, markBailCallUsed, releaseUser } from './state';
import { getAffinity } from './affinity';
import { getCharacter } from '../inworld/characters';
import { getLore } from '../inworld/lore';
import { completePrompt } from '../llm';
import { scenePhase } from './scene_util';
import { BAIL_THRESHOLD, fallbackBailResponse } from './jail_util';

export interface BailResult {
  ok: boolean;
  error?: 'not_jailed' | 'call_used';
  accepted?: boolean;
  reaction?: string;
}

async function persistBailTurn(
  userId: string,
  characterId: string,
  assistantText: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO chat_messages (user_id, character_id, role, content) VALUES ($1, $2, 'assistant', $3)`,
      [userId, characterId, assistantText],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('[bail] persist turn failed:', e);
  } finally {
    client.release();
  }
}

async function generateBailResponse(
  characterId: string,
  displayName: string,
  accepted: boolean,
): Promise<string> {
  const lore = getLore(characterId);
  const prompt = `You are ${displayName}. Personality: ${lore.personality}.
The user just used their ONE phone call from jail to beg you for bail — they got themselves ARRESTED and ruined your date.
You ${accepted ? 'reluctantly AGREE to come bail them out (annoyed, but you care enough to do it)' : 'REFUSE and hang up on them'}.
Write your 1-2 sentence reaction in character. You may include a brief *stage direction*. Output ONLY the line.`;
  const fallback = fallbackBailResponse(displayName, accepted);
  try {
    const raw = await completePrompt(prompt);
    const line = raw.trim().replace(/^["']|["']$/g, '').slice(0, 400);
    return line || fallback;
  } catch (err) {
    console.warn(`[bail] response generation failed for ${characterId}:`, err);
    return fallback;
  }
}

/**
 * The user's ONE phone call from jail: ask the date to bail them out. They
 * accept if affinity is high enough, otherwise refuse. Either way the call is
 * spent. On acceptance the user is released.
 */
export async function requestBail(userId: string, characterId: string): Promise<BailResult> {
  const scene = await getScene(userId, characterId);
  if (scenePhase(scene) !== 'jailed') return { ok: false, error: 'not_jailed' };
  if (scene.bailCallUsed) return { ok: false, error: 'call_used' };

  await markBailCallUsed(userId, characterId);

  let displayName = characterId;
  try {
    displayName = getCharacter(characterId).displayName;
  } catch {
    /* unknown id */
  }
  const affinity = await getAffinity(userId, characterId);
  const accepted = affinity >= BAIL_THRESHOLD;
  const reaction = await generateBailResponse(characterId, displayName, accepted);
  if (accepted) await releaseUser(userId, characterId);
  await persistBailTurn(userId, characterId, reaction);
  return { ok: true, accepted, reaction };
}
