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
import { incrementAffinity, getAffinityDeltaFromUserMessage } from '../db/affinity';
import { classifyHostility } from '../inworld/moderation';
import {
  retrieveRelevantMemories,
  formatMemoryBlock,
  extractAndStoreFacts,
} from '../db/memory';
import { getCharacter, type CharacterId } from '../inworld/characters';

// Recent turns fed to the LLM for local coherence. Long-term recall comes from
// RAG memory (db/memory.ts), not from replaying a long transcript.
const RECENT_TURNS_FOR_PROMPT = 6;

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

    // First contact: send the character's unique, hand-written greeting verbatim
    // and persist it as the first assistant turn. On every later visit history
    // exists, so this greeting is shown only once.
    const character = getCharacter(characterId);
    const greetingText = character.greeting;

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

  // Small recent window for local coherence; long-term recall is handled by RAG.
  const turns: ChatMessage[] = await loadRecentTurns(
    req.user!.id,
    characterId,
    RECENT_TURNS_FOR_PROMPT,
  );

  // Retrieve long-term memories relevant to this message, and score hostility,
  // both in parallel with setup so they add no user-visible latency.
  const memoriesPromise = retrieveRelevantMemories({
    userId: req.user!.id,
    queryText: message,
  });
  const hostilityPromise = classifyHostility(message);

  // Memory retrieval gates the prompt, so await it before streaming.
  const memoryContext = formatMemoryBlock(await memoriesPromise);

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
      memoryContext,
    })) {
      if (abortController.signal.aborted) break;
      if (chunk.text) {
        assistantFull += chunk.text;
        send('chunk', { text: chunk.text });
      }
    }

    // Persist both user + assistant turns. Done after streaming so we never
    // save half-finished assistant responses on errors.
    await persistTurn({
      userId: req.user!.id,
      characterId,
      userMessage: message,
      assistantMessage: assistantFull,
    });

    // Update long-term memory from this exchange. Fire-and-forget: extraction +
    // embedding are slow and must not delay the response or break chat on error.
    void extractAndStoreFacts({
      userId: req.user!.id,
      characterId,
      userMessage: message,
      assistantMessage: assistantFull,
    });

    // Affinity is scored from the USER's message: a small increment for normal
    // engagement, a penalty for hostile/abusive messages. Hybrid signal =
    // synchronous heuristic combined with the parallel LLM classifier.
    const classifierHostility = await hostilityPromise;
    const affinityDelta = getAffinityDeltaFromUserMessage(message, classifierHostility);
    const newAffinityScore = await incrementAffinity(req.user!.id, characterId, affinityDelta);

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

async function loadRecentTurns(
  userId: string,
  characterId: string,
  limit: number,
): Promise<ChatMessage[]> {
  // Query DESC + LIMIT to get the N most-recent turns, then reverse for chronological order.
  const { rows } = await pool.query<{ role: 'user' | 'assistant'; content: string }>(
    `SELECT role, content FROM chat_messages
     WHERE user_id = $1 AND character_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, characterId, limit],
  );
  return rows.reverse();
}

// Full-ish backlog used by /greet to render the conversation when it already exists.
function loadHistory(userId: string, characterId: string): Promise<ChatMessage[]> {
  return loadRecentTurns(userId, characterId, 30);
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
