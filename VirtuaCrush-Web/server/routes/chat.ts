// SSE streaming chat endpoint.
// Flow:
//   1. Validate request body
//   2. Open SSE stream (text/event-stream)
//   3. Stream chunks from Inworld -> client as `event: chunk` events
//   4. On success, persist both turns + increment usage (free users only)
//   5. On error, send `event: error` and close
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { enforceMessageQuota } from '../middleware/rateLimit';
import { streamChat, type ChatMessage } from '../inworld/chat';
import { incrementUsage, FREE_TIER_DAILY_LIMIT } from '../db/usage';
import { isSubscribed } from '../db/subscriptions';
import { pool } from '../db/pool';
import { incrementAffinity } from '../db/affinity';
import type { CharacterId } from '../inworld/characters';

const router = Router();

interface ChatRequestBody {
  characterId: CharacterId;
  message: string;
}

router.post('/greet', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.body as { characterId: string };

  if (!characterId) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  try {
    // Check for existing history
    const { rows } = await pool.query(
      `SELECT 1 FROM chat_messages
       WHERE user_id = $1 AND character_id = $2
       LIMIT 1`,
      [req.user!.id, characterId],
    );

    if (rows.length > 0) {
      const history = await loadHistory(req.user!.id, characterId);
      return res.json({ hasHistory: true, history });
    }

    // New user — fetch affinity (0 for a brand new user)
    const affinityResult = await pool.query(
      `SELECT score FROM character_affinity
       WHERE user_id = $1 AND character_id = $2`,
      [req.user!.id, characterId],
    );
    const affinityScore = affinityResult.rows[0]
      ? parseFloat(affinityResult.rows[0].score)
      : 0;

    // Build a greeting-specific prompt and generate through the LLM
    const greetingPrompt = buildGreetingPrompt(affinityScore);

    let greetingText = '';
    for await (const chunk of streamChat({
      characterId: characterId as CharacterId,
      history: [],
      userMessage: greetingPrompt,
    })) {
      greetingText += chunk;
    }

    // Save the greeting as the first assistant turn
    await pool.query(
      `INSERT INTO chat_messages (user_id, character_id, role, content)
       VALUES ($1, $2, 'assistant', $3)`,
      [req.user!.id, characterId, greetingText],
    );

    return res.json({ hasHistory: false, greeting: greetingText });
  } catch (err) {
    console.error('[chat] greet error:', err);
    return res.status(500).json({ error: 'greet_failed' });
  }
});

router.post('/stream', requireAuth, enforceMessageQuota, async (req: Request, res: Response) => {
  const { characterId, message } = req.body as ChatRequestBody;

  // --- Validate ---
  if (!characterId || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  if (message.length > 4000) {
    return res.status(400).json({ error: 'message_too_long', max: 4000 });
  }

  const turns: ChatMessage[] = await loadHistory(req.user!.id, characterId);

  // --- SSE headers ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');   // nginx: disable proxy buffering
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let assistantFull = '';
  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    for await (const chunk of streamChat({
      characterId,
      history: turns,
      userMessage: message,
    })) {
      if (abortController.signal.aborted) break;
      assistantFull += chunk;
      send('chunk', { text: chunk });
    }

    // Persist both user + assistant turns. Done after streaming so we never
    // save half-finished assistant responses on errors.
    await persistTurn({
      userId: req.user!.id,
      characterId,
      userMessage: message,
      assistantMessage: assistantFull,
    });

    // Increment affinity on the backend. Client displays whatever score we return.
    const newAffinityScore = await incrementAffinity(req.user!.id, characterId);

    // Bump usage only for free users so paid users have a clean 0/null state.
    let remaining: number | null = null;
    if (!(await isSubscribed(req.user!.id))) {
      const used = await incrementUsage(req.user!.id);
      remaining = Math.max(0, FREE_TIER_DAILY_LIMIT - used);
    }

    send('done', { remaining, affinityScore: newAffinityScore });
    res.end();
  } catch (err) {
    console.error('[chat] stream error:', err);
    send('error', { message: 'stream_failed' });
    res.end();
  }
});

async function loadHistory(userId: string, characterId: string): Promise<ChatMessage[]> {
  // Query DESC + LIMIT to get the N most-recent turns, then reverse for chronological order.
  const { rows } = await pool.query<{ role: 'user' | 'assistant'; content: string }>(
    `SELECT role, content FROM chat_messages
     WHERE user_id = $1 AND character_id = $2
     ORDER BY created_at DESC
     LIMIT 30`,
    [userId, characterId],
  );
  return rows.reverse();
}

function buildGreetingPrompt(affinityScore: number): string {
  if (affinityScore === 0) {
    return `[SYSTEM: This is the very first time you are meeting this user. ` +
      `You know nothing about them — not their name, interests, or anything else. ` +
      `Greet them naturally as you would a complete stranger. ` +
      `Keep it to 1-2 sentences and ask one simple question to learn something about them. ` +
      `Do not reference any shared history. Do not ask multiple questions at once.]`;
  }
  if (affinityScore <= 25) {
    return `[SYSTEM: You have spoken with this user briefly before but don't know them well yet. ` +
      `Greet them warmly but without assuming familiarity. Keep it to 1-2 sentences.]`;
  }
  if (affinityScore <= 50) {
    return `[SYSTEM: You and this user have been talking for a while and are becoming genuine friends. ` +
      `Greet them like someone you are happy to see again. Keep it to 1-2 sentences. ` +
      `You can reference that they have talked before without inventing specific details.]`;
  }
  if (affinityScore <= 75) {
    return `[SYSTEM: You and this user are close friends with real history together. ` +
      `Greet them warmly and with familiarity, as if picking up where you left off. ` +
      `Keep it to 1-2 sentences.]`;
  }
  return `[SYSTEM: You and this user share a deep, intimate bond. ` +
    `Greet them with genuine warmth and affection, as someone you have truly missed. ` +
    `Keep it to 1-2 sentences.]`;
}

async function persistTurn(p: {
  userId: string;
  characterId: string;
  userMessage: string;
  assistantMessage: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO chat_messages (user_id, character_id, role, content) VALUES ($1, $2, 'user', $3)`,
      [p.userId, p.characterId, p.userMessage],
    );
    await client.query(
      `INSERT INTO chat_messages (user_id, character_id, role, content) VALUES ($1, $2, 'assistant', $3)`,
      [p.userId, p.characterId, p.assistantMessage],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export default router;