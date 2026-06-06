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
import { incrementAffinity, getAffinity, getAffinityDeltaFromUserMessage } from '../db/affinity';
import { classifyHostility } from '../inworld/moderation';
import {
  retrieveRelevantMemories,
  formatMemoryBlock,
  extractAndStoreFacts,
  storeSignificantEvent,
} from '../db/memory';
import { getCharacter, type CharacterId } from '../inworld/characters';
import { getLore, formatCharacterFactsBlock } from '../inworld/lore';
import { getSituation, arrestUser, appendIncident } from '../db/state';
import { formatSituationBlock, scenePhase } from '../db/scene_util';
import { decideNarrationMode, formatNarrationDirective } from '../db/narration_util';
import { formatRoleplayDirectives } from '../db/roleplay_util';
import { detectPlanCue, shouldOfferDateChoice } from '../db/cue_util';
import { detectWorldEvent, formatWorldEventDirective, incidentForEvent, detectSpending } from '../db/world_util';
import {
  jailNarratorPrompt,
  jailContextBlock,
  formatArrestDirective,
  jailEndFrom,
  JAIL_ARREST_AFFINITY,
} from '../db/jail_util';
import { getLocation } from '../inworld/scenes';
import { maybeCreateChoice } from '../db/choices';

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
  // Current situation = daily story state + dating scene (on a date or at home).
  // Lazily generated if it's a new day; never throws.
  const situationPromise = getSituation(req.user!.id, characterId);
  const affinityPromise = getAffinity(req.user!.id, characterId);
  const hostilityPromise = classifyHostility(message);

  // Gate the prompt on these before streaming.
  const [situation, memories, affinity] = await Promise.all([
    situationPromise,
    memoriesPromise,
    affinityPromise,
  ]);
  let displayName = characterId;
  try { displayName = getCharacter(characterId).displayName; } catch { /* unknown id */ }

  const scene = situation.scene;
  const phase = scenePhase(scene);

  let systemOverride: string | undefined;
  let memoryContext: string;
  let arrested = false;
  let arrestAffinity: number | null = null;
  let worldEventFired = false;

  if (phase === 'jailed') {
    // The user is in a holding cell. A strict jail NARRATOR takes over (the date
    // character is not present) and imposes realism on what the user can do.
    systemOverride = jailNarratorPrompt(displayName, !!scene.bailCallUsed);
    memoryContext = jailContextBlock();
  } else {
    const narrationDirective = formatNarrationDirective(decideNarrationMode(message), displayName);

    // World event: the ENGINE (not the LLM) decides whether the user's input
    // triggers a world reaction. Runs in every non-jailed phase; a CRIME always
    // escalates to an arrest, mischief draws a warning. On a date the authority
    // is the venue's; off a date it's the wider authorities reacting remotely.
    let eventDirective = '';
    const event = detectWorldEvent(message);
    if (event.kind !== 'none') {
      worldEventFired = true;
      const onDate = phase === 'on_date';
      const loc = onDate ? getLocation(scene.location) : null;
      const authority = onDate ? (loc?.authority ?? 'a security guard') : 'the authorities';
      const venueLabel = onDate ? (loc?.label ?? 'the venue') : 'where they are';
      if (event.crimeType) {
        arrested = true;
        await arrestUser(req.user!.id, characterId, jailEndFrom());
        arrestAffinity = await incrementAffinity(req.user!.id, characterId, JAIL_ARREST_AFFINITY);
        void storeSignificantEvent(
          req.user!.id,
          characterId,
          onDate
            ? `User was ARRESTED for ${event.crimeType} on their date at ${venueLabel}; the date ended in total disaster.`
            : `User was ARRESTED for ${event.crimeType}.`,
        );
        eventDirective = formatArrestDirective(event.crimeType, venueLabel, authority, displayName, onDate);
      } else {
        // mischief
        eventDirective = formatWorldEventDirective(event, authority, displayName, onDate);
        void storeSignificantEvent(
          req.user!.id,
          characterId,
          onDate
            ? `User caused a disruptive scene during their date at ${venueLabel}.`
            : `User did something disruptive/reckless while apart.`,
        );
        // Record a priced incident for the end-date bill (dates only).
        if (onDate) {
          const incident = incidentForEvent(event);
          if (incident) void appendIncident(req.user!.id, characterId, incident);
        }
      }
    }

    // Notable on-date spending becomes a deterministic bill line item.
    if (phase === 'on_date' && !arrested) {
      const spend = detectSpending(message);
      if (spend) void appendIncident(req.user!.id, characterId, spend);
    }

    memoryContext =
      formatSituationBlock(situation.state, scene, displayName, affinity) +
      formatCharacterFactsBlock(getLore(characterId)) +
      formatRoleplayDirectives(displayName) +
      narrationDirective +
      eventDirective +
      formatMemoryBlock(memories);
  }

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
      systemOverride,
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

    // Update long-term memory from this exchange (not while jailed — those aren't
    // durable user facts). Fire-and-forget so it never delays the response.
    if (phase !== 'jailed') {
      void extractAndStoreFacts({
        userId: req.user!.id,
        characterId,
        userMessage: message,
        assistantMessage: assistantFull,
      });
    }

    // Affinity: an arrest already applied its big hit; while jailed nothing
    // changes (the character isn't present); otherwise score the user's message.
    let newAffinityScore: number;
    if (arrested) {
      newAffinityScore = arrestAffinity ?? affinity;
    } else if (phase === 'jailed') {
      newAffinityScore = affinity;
    } else {
      const classifierHostility = await hostilityPromise;
      const affinityDelta = getAffinityDeltaFromUserMessage(message, classifierHostility);
      newAffinityScore = await incrementAffinity(req.user!.id, characterId, affinityDelta);
    }

    // Bump usage only for free users so paid users have a clean 0/null state.
    let remaining: number | null = null;
    if (!(await isSubscribed(req.user!.id))) {
      const used = await incrementUsage(req.user!.id);
      remaining = Math.max(0, FREE_TIER_DAILY_LIMIT - used);
    }

    send('done', { remaining, affinityScore: newAffinityScore });

    // Offer a date choice when the conversation naturally turns toward making
    // plans (cue-based, with a cooldown). Only when apart — during a date the
    // only prompt is the persistent "End date" bill flow. Sent as its own SSE
    // event AFTER `done` so the reply isn't delayed.
    if (!abortController.signal.aborted && phase === 'home' && !arrested && !worldEventFired) {
      try {
        const { rows: cntRows } = await pool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM chat_messages
           WHERE user_id = $1 AND character_id = $2 AND role = 'user'`,
          [req.user!.id, characterId],
        );
        const userMsgCount = Number(cntRows[0]?.n ?? 0);

        const { rows: lastRows } = await pool.query<{ created_at: string }>(
          `SELECT created_at FROM dialogue_choices
           WHERE user_id = $1 AND character_id = $2 ORDER BY created_at DESC LIMIT 1`,
          [req.user!.id, characterId],
        );
        const hadPriorChoice = lastRows.length > 0;
        let msgsSinceLastChoice = userMsgCount;
        if (hadPriorChoice) {
          const { rows: sinceRows } = await pool.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM chat_messages
             WHERE user_id = $1 AND character_id = $2 AND role = 'user' AND created_at > $3`,
            [req.user!.id, characterId, lastRows[0].created_at],
          );
          msgsSinceLastChoice = Number(sinceRows[0]?.n ?? 0);
        }

        const cue = detectPlanCue(message, assistantFull);
        if (shouldOfferDateChoice({ userMsgCount, msgsSinceLastChoice, hadPriorChoice, cue })) {
          const choice = await maybeCreateChoice(req.user!.id, characterId, userMsgCount);
          if (choice && !abortController.signal.aborted) send('choice', choice);
        }
      } catch (choiceErr) {
        console.warn('[chat] choice offer failed:', choiceErr);
      }
    }

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
