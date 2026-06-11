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
import { buildScenePrompt, parseScene, companionTagFor, turnsToTranscript, type Actor } from '../inworld/director';
import { authorityActor } from '../inworld/npcs';
import { incrementUsage, FREE_TIER_DAILY_LIMIT } from '../db/usage';
import { isSubscribed } from '../db/subscriptions';
import { pool } from '../db/pool';
import { getAffinity } from '../db/affinity';
import {
  retrieveRelevantMemories,
  formatMemoryBlock,
  extractAndStoreFacts,
  storeSignificantEvent,
} from '../db/memory';
import { getCharacter, type CharacterId } from '../inworld/characters';
import { getLore, formatCharacterFactsBlock } from '../inworld/lore';
import { formatPersonaTraitsBlock, shouldRevealSecret } from '../sim/traits';
import { type DriveEventCard } from '../sim/drives';
import {
  initEmotions,
  decayEmotions,
  emotionDeltasForIntent,
  applyEmotionDeltas,
  emotionToneBlock,
  pendingEventFromEmotions,
  type EmotionState,
} from '../sim/emotions';
import { getSituation, setScene, setMood } from '../db/state';
import { moodShiftForIntent } from '../sim/vitals';
import { getOrComposeScene, renderSceneHeader, renderSceneFactsBlock } from '../db/scene_composition';
import type { SceneCastMember } from '../sim/scene_composer';
import { formatSituationBlock, scenePhase } from '../db/scene_util';
import { ROLEPLAY_INPUT_DIRECTIVE, directorDisciplineDirective } from '../db/roleplay_util';
import { detectPlanCue, detectAgreedVenue, shouldOfferDateChoice } from '../db/cue_util';
import { jailNarratorPrompt, jailContextBlock } from '../db/jail_util';
import { getLocation } from '../inworld/scenes';
import { maybeCreateChoice } from '../db/choices';
import { runLightTick } from '../db/sim_world';
import { assembleWorld } from '../db/sim_world';
import type { PlayerIntent } from '../sim/intent';
import type { WorldState, NpcEntity } from '../sim/world';
import { consequencesFor } from '../sim/rules';
import { planEffects } from '../sim/effects';
import { applyEffects } from '../db/sim_apply';
import { advanceNpcs } from '../sim/agency';
import { describeKnownPlayer, observePlayer, describeAppearance } from '../sim/player';
import { describeLastSeenOutfit, itemsById, wornItems, describeOutfit, describeGrooming } from '../sim/wardrobe';
import { upsertNpcState } from '../db/npc_state';
import { looksDegenerate } from '../llm/quality';
import { vetoVictimCrime } from '../sim/victim';
import { budgetHistory } from '../llm/budget';

// Recent turns fed to the LLM for local coherence. Long-term recall comes from
// RAG memory (db/memory.ts), not from replaying a long transcript.
// Bigger window = the model can see (and is told to avoid) its own recent
// phrasing, which is the main lever against verbatim self-repetition.
const RECENT_TURNS_FOR_PROMPT = 12;

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
    // Compose the opening scene (engine-authoritative: time, setting, outfit,
    // who's around). Fail-soft: a composer hiccup must never block the chat.
    let sceneHeader: string | undefined;
    try {
      const character = getCharacter(characterId);
      const situation = await getSituation(req.user!.id, characterId);
      const comp = await getOrComposeScene(req.user!.id, characterId, character.displayName, situation);
      if (comp) sceneHeader = renderSceneHeader(comp, character.displayName);
    } catch (sceneErr) {
      console.warn('[chat] scene composition failed:', sceneErr);
    }

    // Check for existing history
    const { rows } = await pool.query(
      `SELECT 1 FROM chat_messages
       WHERE user_id = $1 AND character_id = $2
       LIMIT 1`,
      [req.user!.id, characterId],
    );

    if (rows.length > 0) {
      const history = await loadHistory(req.user!.id, characterId);
      return res.json({ hasHistory: true, history, sceneHeader });
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

    return res.json({ hasHistory: false, greeting: greetingText, sceneHeader });
  } catch (err) {
    console.error('[chat] greet error:', err);
    return res.status(500).json({ error: 'greet_failed' });
  }
});

// Conversation archive for the chat-history side panel: one entry per day
// that has messages, newest first.
router.get('/history/:characterId', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.params;

  if (!characterId) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  try {
    const { rows } = await pool.query<{
      day: string;
      first_user_message: string | null;
      last_message: string;
      last_role: 'user' | 'assistant';
      message_count: number;
    }>(
      `SELECT
         to_char(created_at::date, 'YYYY-MM-DD') AS day,
         (array_agg(content ORDER BY created_at ASC) FILTER (WHERE role = 'user'))[1] AS first_user_message,
         (array_agg(content ORDER BY created_at DESC))[1] AS last_message,
         (array_agg(role ORDER BY created_at DESC))[1] AS last_role,
         count(*)::int AS message_count
       FROM chat_messages
       WHERE user_id = $1 AND character_id = $2
       GROUP BY created_at::date
       ORDER BY created_at::date DESC`,
      [req.user!.id, characterId],
    );

    const days = rows.map((r) => ({
      id: r.day,
      day: r.day,
      title: r.first_user_message?.slice(0, 80).trim() || null,
      lastRole: r.last_role,
      lastMessage: r.last_message.slice(0, 140),
      messageCount: r.message_count,
    }));

    return res.json({ days });
  } catch (err) {
    console.error('[chat] history error:', err);
    return res.status(500).json({ error: 'history_failed' });
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

  // Recent window for local coherence; long-term recall is handled by RAG.
  // budgetHistory keeps the newest turns verbatim and snips older ones so the
  // window never blows up the per-message token bill.
  const turns: ChatMessage[] = budgetHistory(
    await loadRecentTurns(req.user!.id, characterId, RECENT_TURNS_FOR_PROMPT),
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
  let world: WorldState | undefined;
  let companionEntity: NpcEntity | undefined;
  let onDate = false;
  let revealSecretNow = false;
  let emotions: EmotionState | undefined;
  let drivePressure = false;
  let newPendingEvent: DriveEventCard | undefined;
  let arrested = false;
  let appliedAffinity: number | null = null;
  let worldEventFired = false;
  let rippleRumor: string | null = null;

  if (phase === 'jailed') {
    // The user is in a holding cell. A strict jail NARRATOR takes over (the date
    // character is not present) and imposes realism on what the user can do.
    systemOverride = jailNarratorPrompt(displayName, !!scene.bailCallUsed);
    memoryContext = jailContextBlock();
  } else {
    // === Single merged call: classify the player's action AND narrate the scene
    // in one LLM round (the consequences are applied below, from that
    // classification — the engine stays authoritative on state). Halves calls.
    world = await assembleWorld(req.user!.id, characterId);
    companionEntity = world.npcs[characterId];
    onDate = phase === 'on_date';
    const authority = onDate ? (getLocation(scene.location)?.authority ?? 'a security guard') : 'the authorities';

    const npcs: Actor[] = [];
    if (onDate) {
      npcs.push(authorityActor(authority, 'venue staff/security — bring them in only if the player causes a scene or commits a crime'));
    }

    // Composed scene: authoritative time/setting/outfit facts + anyone else
    // present (e.g. her friend) registered as a voiceable actor. Fail-soft.
    let sceneFacts = '';
    let sceneCast: SceneCastMember[] = [];
    try {
      const comp = await getOrComposeScene(req.user!.id, characterId, displayName, situation);
      if (comp) {
        sceneFacts = renderSceneFactsBlock(comp, displayName);
        sceneCast = comp.cast;
      }
    } catch (sceneErr) {
      console.warn('[chat] scene facts failed:', sceneErr);
    }
    for (const m of sceneCast) {
      npcs.push({
        tag: m.name.toUpperCase(),
        name: m.name,
        kind: 'npc',
        brief: `${displayName}'s ${m.role} — ${m.vibe}; right now she ${m.agenda}`,
      });
    }

    // NPC agency: autonomous, goal-driven actions this tick (not scripted).
    let agencyHint = '';
    for (const act of advanceNpcs(world, { next: () => Math.random() })) {
      if (act.npc === characterId) {
        agencyHint += `\n\nINNER DRIVE: ${displayName} feels inclined to ${act.action.replace(/_/g, ' ')} (${act.reason}) — let it color the reply, in character.`;
      } else {
        const other = world.npcs[act.npc];
        npcs.push({ tag: (other?.name ?? act.npc).toUpperCase(), name: other?.name ?? act.npc, kind: 'npc', brief: `${act.action.replace(/_/g, ' ')} — ${act.reason}` });
      }
    }

    // What the companion knows about the player (perception-gated).
    const playerKnown = companionEntity ? describeKnownPlayer(world.user.profile, companionEntity) : '';
    let lookNote = '';
    if (onDate) {
      const appearanceDesc = describeAppearance(world.user.profile.appearance);
      const outfitDesc = describeOutfit(wornItems(world.user.presentation, world.user.inventory));
      const groomingDesc = describeGrooming(world.user.presentation.grooming);
      const bits = [appearanceDesc && `appearance — ${appearanceDesc}`, outfitDesc && `currently wearing ${outfitDesc}`, groomingDesc || ''].filter(Boolean);
      lookNote = bits.length
        ? `\n\nYOU CAN SEE THE PLAYER RIGHT NOW: ${bits.join('; ')}. Describe their looks ONLY as stated here — do NOT invent or change their clothing, hair, or features.`
        : `\n\nYou can see the player, but their appearance and outfit are not defined — do NOT invent clothing or looks.`;
    } else if (companionEntity) {
      const lastOutfit = describeLastSeenOutfit(companionEntity.knowledge.lastSeenOutfit, 'player', itemsById(world.user.inventory));
      lookNote = lastOutfit
        ? `\n\nLAST TIME YOU SAW THE PLAYER they were wearing ${lastOutfit}; you do not know if that has changed. Do NOT invent a different outfit.`
        : `\n\nYou are apart and cannot see the player — do NOT invent what they are wearing.`;
    }

    const secretDiscovered = Boolean(companionEntity?.knowledge.secretDiscovered);
    revealSecretNow = shouldRevealSecret({ affinity, discovered: secretDiscovered, message });

    // --- Emotions: decay since last update, maybe surface an event card, and
    // feed the current state into the prompt so tone tracks the gauges.
    let emotionTone = '';
    if (companionEntity) {
      const k = companionEntity.knowledge;
      const prev = (k.emotions as EmotionState | undefined) ?? initEmotions(characterId);
      const lastAt = k.emotionsUpdatedAt ? new Date(k.emotionsUpdatedAt as string).getTime() : Date.now();
      const hours = Math.min(12, Math.max(0, (Date.now() - lastAt) / 3_600_000));
      emotions = decayEmotions(prev, characterId, hours);
      emotionTone = emotionToneBlock(emotions, displayName);
      drivePressure = (emotions.aroused ?? 0) >= 55 || (emotions.playful ?? 0) >= 55;
      if (!k.pendingDriveEvent) {
        newPendingEvent = pendingEventFromEmotions(emotions, characterId, displayName) ?? undefined;
      }
    }
    const driveReaction = (companionEntity?.knowledge.pendingDriveReaction as string | undefined) || '';

    const directives =
      formatSituationBlock(situation.state, scene, displayName, affinity) +
      sceneFacts +
      formatCharacterFactsBlock(getLore(characterId)) +
      formatPersonaTraitsBlock(getLore(characterId), { discovered: secretDiscovered, revealNow: revealSecretNow }) +
      ROLEPLAY_INPUT_DIRECTIVE +
      directorDisciplineDirective(displayName) +
      playerKnown +
      lookNote +
      agencyHint +
      emotionTone +
      (driveReaction ? `\n\n${driveReaction}` : '') +
      formatMemoryBlock(memories);

    directorPrompt = buildScenePrompt({
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
      // ONE call classifies the player's action AND narrates the scene.
      // Degenerate output (token salad from a flaky provider) triggers the same
      // single retry as an unparseable reply; twice in a row falls through to
      // the in-character recovery line below instead of showing garbage.
      const badReply = (p: { turns: { text: string }[] }) =>
        p.turns.length === 0 || p.turns.some((t) => looksDegenerate(t.text));
      const raw1 = await completePrompt(directorPrompt!);
      let parsed = parseScene(raw1, displayName);
      if (badReply(parsed)) {
        // Retry once; if that also fails, log a snippet so the cause (truncated
        // JSON, token salad, refusal, ...) is visible in the server logs.
        const raw2 = await completePrompt(directorPrompt!);
        parsed = parseScene(raw2, displayName);
        if (badReply(parsed)) {
          console.warn(
            `[chat] director output unusable twice (${characterId}); raw tail: …${(raw2 || raw1 || '').slice(-220)}`,
          );
        }
      }
      if (parsed.turns.some((t) => looksDegenerate(t.text))) {
        parsed = { ...parsed, turns: [] };
      }
      // Victim guard: being kidnapped/robbed/attacked in the fiction is the
      // player suffering a crime, not committing one — never arrest the victim.
      const effIntent: PlayerIntent = vetoVictimCrime(
        parsed.intent ?? { type: 'observation', subtype: 'wait' },
        message,
      );
      // Engine stays authoritative: apply consequences from the classification.
      const plan = planEffects(consequencesFor(effIntent, world!));
      const applied = await applyEffects(req.user!.id, characterId, plan);
      arrested = applied.arrested;
      appliedAffinity = applied.affinityScore;
      worldEventFired = plan.arrest || plan.warnings.length > 0;

      // Conversation-driven emotions: the classified action moves the gauges
      // immediately — wall-clock drift alone is imperceptible in a session.
      if (companionEntity && emotions) {
        emotions = applyEmotionDeltas(emotions, emotionDeltasForIntent(effIntent));
      }
      const moodShift = moodShiftForIntent(effIntent);
      if (moodShift) {
        void setMood(req.user!.id, characterId, moodShift).catch((e) => console.warn('[chat] mood update failed:', e));
      }
      if (plan.arrest) {
        const crimeLabel = effIntent.subtype.replace(/_/g, ' ');
        rippleRumor = `the player got arrested for ${crimeLabel}`;
        void storeSignificantEvent(req.user!.id, characterId, `Player was ARRESTED for ${crimeLabel}.`);
      }
      const dturns = parsed.turns.length ? parsed.turns : [{ speaker: displayName, text: 'Mm — say that again? You had me for a second there.' }];
      assistantFull = turnsToTranscript(dturns);
      if (!abortController.signal.aborted) send('chunk', { text: assistantFull });

      // Perception update for NEXT turn: companion learns name/bio, and outfit when co-present.
      if (companionEntity) {
        const learnedFacts = observePlayer({ coPresent: onDate, message, profile: world!.user.profile, existingFacts: companionEntity.knowledge.knownPlayerFacts });
        const lastSeenOutfit = onDate ? { ...companionEntity.knowledge.lastSeenOutfit, player: world!.user.presentation.wornItemIds } : companionEntity.knowledge.lastSeenOutfit;
        const knowledgePatch: Record<string, unknown> = {
          ...companionEntity.knowledge,
          knownPlayerFacts: learnedFacts,
          lastSeenOutfit,
          emotions: emotions ?? companionEntity.knowledge.emotions,
          emotionsUpdatedAt: new Date().toISOString(),
          pendingDriveEvent: newPendingEvent ?? companionEntity.knowledge.pendingDriveEvent ?? null,
          pendingDriveReaction: null,
        };
        if (revealSecretNow) {
          knowledgePatch.secretDiscovered = true;
          void storeSignificantEvent(req.user!.id, characterId, `Player uncovered ${displayName}'s secret: ${getLore(characterId).secret.label}.`);
        }
        void upsertNpcState(req.user!.id, characterId, { knowledge: knowledgePatch }).catch((e) => console.warn('[chat] perception update failed:', e));
      }

      // Free-text date agreement: if the pair just committed to a venue in
      // plain dialogue (no choice card), record the plan so the sim and the
      // fiction stay in sync — the planning-phase situation block then tells
      // the character where she's headed instead of leaving her clueless.
      if (phase === 'home') {
        const agreedVenue = detectAgreedVenue(message, assistantFull);
        if (agreedVenue) {
          void setScene(req.user!.id, characterId, {
            mode: 'apart',
            location: null,
            billPending: false,
            plannedLocation: agreedVenue,
          }).catch((e) => console.warn('[chat] plan sync failed:', e));
          void storeSignificantEvent(req.user!.id, characterId, `Agreed to meet up at the ${agreedVenue.replace(/_/g, ' ')}.`);
        }
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

    // Advance the living world a little each message (deterministic, no LLM, off the
    // response path). Reactive ripple: notable actions seed a rumor that then spreads.
    const ripple = rippleRumor
      ? {
          rumors: [{ npcId: characterId, rumor: { text: rippleRumor, credibility: 0.9, virality: 0.7, age: 0 } }],
          events: [{ at: 0, kind: 'event', actors: ['player', characterId], text: `Word is spreading that ${rippleRumor}.` }],
          excludeId: characterId,
        }
      : { excludeId: characterId };
    void runLightTick(req.user!.id, ripple).catch((e) => console.warn('[tick] light tick failed:', e));

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
        if (shouldOfferDateChoice({ userMsgCount, msgsSinceLastChoice, hadPriorChoice, cue, drivePressure })) {
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
