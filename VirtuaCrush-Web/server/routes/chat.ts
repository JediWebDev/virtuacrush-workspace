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
import { streamChat, completePrompt, type ChatMessage } from '../inworld/chat';
import { buildDirectorPrompt, companionTagFor, parseDirectorTurns, turnsToTranscript, type Actor } from '../inworld/director';
import { authorityActor } from '../inworld/npcs';
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
import { ROLEPLAY_INPUT_DIRECTIVE, directorDisciplineDirective } from '../db/roleplay_util';
import { detectPlanCue, shouldOfferDateChoice } from '../db/cue_util';
import {
  detectWorldEvent,
  formatWorldEventDirective,
  incidentForEvent,
  detectSpending,
  respondersFor,
  countMischief,
  MISCHIEF_STRIKE_LIMIT,
} from '../db/world_util';
import {
  jailNarratorPrompt,
  jailContextBlock,
  formatArrestDirective,
  jailEndFrom,
  JAIL_ARREST_AFFINITY,
} from '../db/jail_util';
import { getLocation } from '../inworld/scenes';
import { maybeCreateChoice } from '../db/choices';
import { assembleWorld } from '../db/sim_world';
import { extractIntent, refereeInputFromWorld } from '../sim/referee';
import { consequencesFor } from '../sim/rules';
import { planEffects } from '../sim/effects';
import { applyEffects } from '../db/sim_apply';
import { advanceNpcs } from '../sim/agency';
import { describeKnownPlayer } from '../sim/player';
import { describeLastSeenOutfit, itemsById } from '../sim/wardrobe';

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
  let memoryContext = '';
  let directorPrompt: string | undefined;
  let arrested = false;
  let appliedAffinity: number | null = null;
  let worldEventFired = false;

  if (phase === 'jailed') {
    // The user is in a holding cell. A strict jail NARRATOR takes over (the date
    // character is not present) and imposes realism on what the user can do.
    systemOverride = jailNarratorPrompt(displayName, !!scene.bailCallUsed);
    memoryContext = jailContextBlock();
  } else {
    // === The simulation loop: referee classifies intent -> engine decides
    // consequences -> applier persists -> agency ticks NPCs -> director narrates.
    // No regex detection; understanding comes from the referee.
    const world = await assembleWorld(req.user!.id, characterId);
    const referee = await extractIntent(refereeInputFromWorld(world, message, turns), completePrompt);
    const plan = planEffects(consequencesFor(referee.intent, world));
    const applied = await applyEffects(req.user!.id, characterId, plan);
    arrested = applied.arrested;
    appliedAffinity = applied.affinityScore;
    worldEventFired = plan.arrest || plan.warnings.length > 0;

    const onDate = phase === 'on_date';
    const authority = onDate ? (getLocation(scene.location)?.authority ?? 'a security guard') : 'the authorities';
    const venueLabel = onDate ? (getLocation(scene.location)?.label ?? 'the venue') : 'where they are';

    const npcs: Actor[] = [];
    let eventDirective = '';
    if (plan.arrest) {
      const responders = plan.responders.length ? plan.responders.join(' and ') : 'the police';
      const crimeLabel = referee.intent.subtype.replace(/_/g, ' ');
      eventDirective =
        `\n\n>>> ARREST EVENT (decided by the simulation — narrate it, do not change it): the user just committed ${crimeLabel}. ` +
        `${responders} arrive and the user is being ARRESTED, handcuffed, and hauled to a holding cell. Have ${displayName} react ` +
        `with genuine shock in character. Narrate the bust in *stage directions*. This is serious — do NOT treat it as flirty, casual, or a joke.`;
      npcs.push(authorityActor(authority, `Moves in as ${responders} arrive to arrest the user.`));
      void storeSignificantEvent(
        req.user!.id,
        characterId,
        onDate ? `User was ARRESTED for ${crimeLabel} on their date at ${venueLabel}.` : `User was ARRESTED for ${crimeLabel}.`,
      );
    } else if (plan.warnings.length) {
      eventDirective =
        `\n\nWORLD EVENT (decided by the simulation — narrate it, do not change it): ${authority} steps in over the user's behavior ` +
        `(${plan.warnings.join(', ')}). Narrate ${authority}'s reaction in *stage directions*; have ${displayName} react in character. Keep it grounded.`;
      npcs.push(authorityActor(authority, `Steps in to warn the user over ${plan.warnings.join(', ')}.`));
    }

    // NPC agency: autonomous, goal-driven actions this tick (not scripted).
    const companionEntity = world.npcs[characterId];
    let agencyHint = '';
    for (const act of advanceNpcs(world, { next: () => Math.random() })) {
      if (act.npc === characterId) {
        agencyHint += `\n\nINNER DRIVE: ${displayName} feels inclined to ${act.action.replace(/_/g, ' ')} (${act.reason}) — let it color the reply, in character.`;
      } else {
        const other = world.npcs[act.npc];
        npcs.push({ tag: (other?.name ?? act.npc).toUpperCase(), name: other?.name ?? act.npc, kind: 'npc', brief: `${act.action.replace(/_/g, ' ')} — ${act.reason}` });
      }
    }

    // Perception-gated: what this companion actually knows about the player, and
    // the outfit they last saw on them.
    const playerKnown = companionEntity ? describeKnownPlayer(world.user.profile, companionEntity) : '';
    const lastOutfit = companionEntity
      ? describeLastSeenOutfit(companionEntity.knowledge.lastSeenOutfit, 'player', itemsById(world.user.inventory))
      : '';
    const outfitNote = lastOutfit ? `\n\nLAST TIME YOU SAW THE USER, they were wearing: ${lastOutfit}.` : '';

    const directives =
      formatSituationBlock(situation.state, scene, displayName, appliedAffinity ?? affinity) +
      formatCharacterFactsBlock(getLore(characterId)) +
      ROLEPLAY_INPUT_DIRECTIVE +
      directorDisciplineDirective(displayName) +
      playerKnown +
      outfitNote +
      eventDirective +
      agencyHint +
      formatMemoryBlock(memories);

    directorPrompt = buildDirectorPrompt({
      companionSystem: getCharacter(characterId).systemPrompt,
      companionTag: companionTagFor(displayName),
      companionName: displayName,
      npcs,
      directives,
      history: turns,
      userMessage: message,
    });
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
    if (phase === 'jailed') {
      // Jail narrator streams; tag it so the client renders a NARRATOR bubble.
      const prefix = '[NARRATOR] ';
      assistantFull += prefix;
      send('chunk', { text: prefix });
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
    } else {
      // Director Stage 1: one JSON completion (meaning only). Stage 2: deterministic
      // parse -> transcript. Fail-soft guarantees a non-empty turn (no blank replies).
      const rawDirector = await completePrompt(directorPrompt!);
      let dturns = parseDirectorTurns(rawDirector, displayName);
      if (dturns.length === 0) {
        dturns = [{ speaker: displayName, text: 'Sorry — I lost my train of thought there. What were you saying?' }];
      }
      assistantFull = turnsToTranscript(dturns);
      if (!abortController.signal.aborted) send('chunk', { text: assistantFull });
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
    // Affinity is now driven by the engine (consequencesFor -> applyEffects);
    // jailed turns leave it unchanged (the companion isn't present).
    const newAffinityScore: number = phase === 'jailed' ? affinity : (appliedAffinity ?? affinity);

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
