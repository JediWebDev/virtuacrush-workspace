// Story-so-far diary. A sweep job watches for chat sessions that have gone
// idle, summarizes the new messages into 2-6 short narrative beats with one
// small LLM call, and stores them per user/character. The profile rail shows
// the result as "the story so far" — replacing the old world-noise feed.
import { pool } from './pool';
import { completePrompt } from '../llm';
import { getCharacter } from '../inworld/characters';
import { parseFacts } from './memory_util';
import { appendCharacterStoryBeat, inferDiaryBeatWeight, HIGH_SALIENCE_RE } from './story_memory';

export interface DiaryEntry {
  id: string;
  beat: string;
  createdAt: string;
}

// A session is "over" after this much quiet; fewer new messages than the
// minimum isn't worth a beat.
const IDLE_MINUTES = 30;
const MIN_NEW_MESSAGES = 6;
const MAX_BEATS = 6;

export async function listDiary(
  userId: string,
  characterId: string,
  limit = 40,
): Promise<DiaryEntry[]> {
  const { rows } = await pool.query<{ id: string; beat: string; created_at: string }>(
    `SELECT id, beat, created_at FROM chat_diary
     WHERE user_id = $1 AND character_id = $2
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [userId, characterId, limit],
  );
  return rows.map((r) => ({ id: String(r.id), beat: r.beat, createdAt: r.created_at }));
}

const DIARY_PROMPT = `You are keeping a story-so-far diary for a roleplay chat between the player ("You") and {{NAME}}.
From the transcript below, extract the {{MIN}}-{{MAX}} most important story BEATS that actually happened, in order.

Rules:
- Each beat is ONE short past-tense sentence from the player's perspective, e.g. "You were kidnapped by masked men." or "{{NAME}} traded her mysterious book for your freedom."
- Only events that happened in the scene: arrivals, departures, dates, conflicts, rescues, reveals, gifts, big relationship steps.
- Skip small talk, flirting, and banter unless it marked a real turning point.
- If nothing noteworthy happened, return an empty array.
- Respond with ONLY a JSON array of strings. No prose, no fences.

TRANSCRIPT:
"""
{{TRANSCRIPT}}
"""

JSON array:`;

async function summarizeOne(userId: string, characterId: string, since: string | null): Promise<void> {
  const { rows } = await pool.query<{ role: 'user' | 'assistant'; content: string }>(
    `SELECT role, content FROM chat_messages
     WHERE user_id = $1 AND character_id = $2 AND created_at > COALESCE($3::timestamptz, 'epoch'::timestamptz)
     ORDER BY created_at ASC
     LIMIT 80`,
    [userId, characterId, since],
  );
  if (rows.length < MIN_NEW_MESSAGES) return;

  const blob = rows.map((r) => r.content).join('\n');
  // Skip the LLM when the window is pure banter with no plot signals.
  if (!HIGH_SALIENCE_RE.test(blob) && !rows.some((r) => r.content.trim().length > 100)) return;

  let displayName = characterId;
  try { displayName = getCharacter(characterId).displayName; } catch { /* keep id */ }

  const transcript = rows
    .map((m) => `${m.role === 'user' ? 'You' : displayName}: ${m.content.slice(0, 220)}`)
    .join('\n')
    .slice(0, 6000);

  const prompt = DIARY_PROMPT
    .replaceAll('{{NAME}}', displayName)
    .replace('{{MIN}}', '2')
    .replace('{{MAX}}', String(MAX_BEATS))
    .replace('{{TRANSCRIPT}}', transcript);

  const beats = parseFacts(await completePrompt(prompt, { json: true })).slice(0, MAX_BEATS);
  for (const beat of beats) {
    await pool.query(
      `INSERT INTO chat_diary (user_id, character_id, beat) VALUES ($1, $2, $3)`,
      [userId, characterId, beat.slice(0, 240)],
    );
    void appendCharacterStoryBeat(userId, characterId, {
      summary: beat,
      weight: inferDiaryBeatWeight(beat),
      source: 'diary',
    });
  }
  if (beats.length) {
    console.log(`[diary] wrote ${beats.length} beat(s) for user=${userId} character=${characterId}`);
  }
}

/**
 * Sweep: for every (user, character) whose conversation has NEW messages since
 * the last diary entry AND has been idle for 30+ minutes, summarize the new
 * stretch into beats. Cheap query; one small LLM call per due pair. Run from
 * an interval — never throws.
 */
export async function summarizePendingDiaries(): Promise<void> {
  try {
    const { rows } = await pool.query<{
      user_id: string;
      character_id: string;
      last_msg: string;
      last_diary: string | null;
      new_msgs: number;
    }>(
      `SELECT m.user_id, m.character_id,
              max(m.created_at) AS last_msg,
              d.last_diary,
              count(*) FILTER (WHERE m.created_at > COALESCE(d.last_diary, 'epoch'::timestamptz))::int AS new_msgs
       FROM chat_messages m
       LEFT JOIN LATERAL (
         SELECT max(created_at) AS last_diary FROM chat_diary
         WHERE user_id = m.user_id AND character_id = m.character_id
       ) d ON TRUE
       GROUP BY m.user_id, m.character_id, d.last_diary`,
    );
    const now = Date.now();
    for (const r of rows) {
      const idleMs = now - new Date(r.last_msg).getTime();
      if (idleMs < IDLE_MINUTES * 60_000) continue; // session still live
      if (r.new_msgs < MIN_NEW_MESSAGES) continue;
      await summarizeOne(r.user_id, r.character_id, r.last_diary).catch((e) =>
        console.warn('[diary] summarize failed:', e),
      );
    }
  } catch (err) {
    console.warn('[diary] sweep failed:', err);
  }
}
