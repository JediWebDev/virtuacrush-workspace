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
import { buildDirectorPrompt, parseDirectorOutput, parseDirectorTurns, companionTagFor, turnsToTranscript, type Actor, type ArcContext } from '../inworld/director';
import { selectArc, getArc } from '../inworld/arcs';
import { getArcState, setArcActive, clearArc as clearArcState, incrementAbandonmentStrikes, resetAbandonmentStrikes, saveCompletedArc, getCompletedArcIds } from '../db/arc_state';
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
import {
  initEmotions,
  decayEmotions,
  emotionDeltasForIntent,
  applyEmotionDeltas,
  emotionToneBlock,
  pendingEventFromEmotions,
  type EmotionState,
  type DriveEventCard,
} from '../sim/emotions';
import { getSituation, setMood } from '../db/state';
import { moodShiftForIntent } from '../sim/vitals';
import { getOrComposeScene, renderSceneHeader, renderSceneFactsBlock, markDisruptionFired } from '../db/scene_composition';
import type { SceneCastMember } from '../sim/scene_composer';
import {
  nextDueDisruption,
  renderDisruptionDirective,
  disruptionResidue,
  rerollUnfiredDisruptions,
  type PlannedDisruption,
} from '../sim/interruptions';
import { formatSituationBlock, scenePhase } from '../db/scene_util';
import { ROLEPLAY_INPUT_DIRECTIVE, directorDisciplineDirective } from '../db/roleplay_util';
import { getLocation } from '../inworld/scenes';
import { runLightTick, assembleWorld, assembleFullWorld, applyTick, getWorldClock, MIN_IDLE_MINUTES, MAX_CATCHUP_MINUTES } from '../db/sim_world';
import type { PlayerIntent } from '../sim/intent';
import { validateIntent } from '../sim/intent';
import { extractIntent, refereeInputFromWorld } from '../sim/referee';
import { simulateElapsed, stepWorld } from '../sim/tick';
import type { WorldState, NpcEntity } from '../sim/world';
import { consequencesFor } from '../sim/rules';
import { planEffects, formatEngineFactsBlock, type EffectPlan } from '../sim/effects';
import { applyEffects } from '../db/sim_apply';
import { advanceNpcs } from '../sim/agency';
import { describeKnownPlayer, observePlayer, describeAppearance } from '../sim/player';
import { describeLastSeenOutfit, itemsById, wornItems, describeOutfit, describeGrooming } from '../sim/wardrobe';
import { upsertNpcState } from '../db/npc_state';
import { looksDegenerate } from '../llm/quality';
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
      if (comp) sceneHeader = renderSceneHeader(comp, character.displayName, characterId);
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
  const arcStatePromise = getArcState(req.user!.id, characterId);
  const completedArcIdsPromise = getCompletedArcIds(req.user!.id, characterId);

  // Gate the prompt on these before streaming.
  const [situation, memories, affinity, arcStateResult, completedArcIds] = await Promise.all([
    situationPromise,
    memoriesPromise,
    affinityPromise,
    arcStatePromise,
    completedArcIdsPromise,
  ]);

  let arcContext: ArcContext | undefined;
  let arcJustStarted = false;
  let arcIntroNarrative: string | undefined;
  let earnedBadge: { title: string; description: string } | null = null;

  // --- Arc selection / continuation ---
  // If no arc is running, try to select one. If one is active, load it.
  let activeArc = arcStateResult.currentArcId ? getArc(arcStateResult.currentArcId) : null;
  if (!activeArc) {
    const candidate = selectArc(characterId, completedArcIds, null);
    if (candidate) {
      await setArcActive(req.user!.id, characterId, candidate.id);
      activeArc = candidate;
      arcJustStarted = true;
      arcIntroNarrative = candidate.introNarrative;
    }
  }
  if (activeArc) {
    arcContext = {
      npcInstruction: activeArc.npcInstruction,
      completionCriteria: activeArc.completionCriteria,
      completionExamples: activeArc.completionExamples,
    };
  }
  let displayName = characterId;
  try { displayName = getCharacter(characterId).displayName; } catch { /* unknown id */ }

  const scene = situation.scene;
  const phase = scenePhase(scene);

  let directorPrompt: string | undefined;
  let world: WorldState | undefined;
  let companionEntity: NpcEntity | undefined;
  let onDate = false;
  let revealSecretNow = false;
  let emotions: EmotionState | undefined;
  let firedDisruption: PlannedDisruption | null = null;
  let newPendingEvent: DriveEventCard | undefined;
  let appliedAffinity: number | null = null;
  let worldEventFired = false;
  let effIntent: PlayerIntent | undefined;
  let effectPlan: EffectPlan | undefined;
  {
    // === Two-step LLM: referee classifies intent first; director narrates after
    // engine consequences are known (warnings, responders stay causal).
    world = await assembleWorld(req.user!.id, characterId);
    companionEntity = world.npcs[characterId];
    onDate = phase === 'on_date';
    const authority = onDate ? (getLocation(scene.location)?.authority ?? 'a security guard') : 'the authorities';

    // Macro-world catch-up: advance the full roster while the player was away.
    try {
      const { rows: lastMsgRows } = await pool.query<{ created_at: Date }>(
        `SELECT created_at FROM chat_messages
         WHERE user_id = $1 AND character_id = $2 AND role = 'user'
         ORDER BY created_at DESC LIMIT 1`,
        [req.user!.id, characterId],
      );
      const lastMsgAt = lastMsgRows[0]?.created_at;
      const elapsedMin = lastMsgAt ? (Date.now() - new Date(lastMsgAt).getTime()) / 60000 : 0;
      if (elapsedMin >= MIN_IDLE_MINUTES) {
        const elapsed = Math.min(elapsedMin, MAX_CATCHUP_MINUTES);
        const [clock, fullWorld] = await Promise.all([
          getWorldClock(req.user!.id),
          assembleFullWorld(req.user!.id),
        ]);
        const macroResult = simulateElapsed(fullWorld, clock.simMinutes, elapsed, { next: () => Math.random() });
        const companionPatch = macroResult.patches[characterId];
        if (companionPatch) {
          const patch = onDate ? { ...companionPatch, location: undefined } : companionPatch;
          world = stepWorld(world, { [characterId]: patch });
          companionEntity = world.npcs[characterId];
        }
        void applyTick(req.user!.id, fullWorld, macroResult, clock.simMinutes + elapsed)
          .catch((e) => console.warn('[chat] macro catch-up persist failed:', e));
      }
    } catch (macroErr) {
      console.warn('[chat] macro catch-up failed:', macroErr);
    }

    const npcs: Actor[] = [];
    if (onDate) {
      npcs.push(authorityActor(authority, 'venue staff/security — bring them in only if the player causes a scene'));
    }

    // Composed scene: authoritative time/setting/outfit facts + anyone else
    // present (e.g. her friend) registered as a voiceable actor. Fail-soft.
    let sceneFacts = '';
    let sceneCast: SceneCastMember[] = [];
    let disruptionDirective = '';
    try {
      const comp = await getOrComposeScene(req.user!.id, characterId, displayName, situation);
      if (comp) {
        sceneFacts = renderSceneFactsBlock(comp, displayName, characterId);
        sceneCast = comp.cast;

        // Mid-scene interruptions: fire the next pre-rolled disruption when
        // its turn arrives. Turn index = user messages since this scene was
        // composed, plus the message being answered right now.
        const { rows: turnRows } = await pool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM chat_messages
           WHERE user_id = $1 AND character_id = $2 AND role = 'user' AND created_at > $3::timestamptz`,
          [req.user!.id, characterId, comp.composedAt],
        );
        const turn = Number(turnRows[0]?.n ?? 0) + 1;
        const due = nextDueDisruption(comp, turn);
        if (due) {
          disruptionDirective = renderDisruptionDirective(due, displayName, characterId);
          firedDisruption = due;
        }

        // When a new arc just activated, re-bias the remaining unfired
        // disruption slots toward thematically resonant events.
        if (arcJustStarted && activeArc && (comp.disruptions ?? []).length > 0) {
          const firedIds = new Set(comp.firedDisruptions ?? []);
          const rerolled = rerollUnfiredDisruptions(
            comp.disruptions ?? [],
            firedIds,
            activeArc.arcTags,
            { phase: onDate ? 'on_date' : 'home', hasFriend: (comp.cast ?? []).length > 0 },
          );
          void pool.query(
            `UPDATE character_state
               SET scene_composition = jsonb_set(
                 COALESCE(scene_composition, '{}'::jsonb),
                 '{disruptions}',
                 $3::jsonb
               )
             WHERE user_id = $1 AND character_id = $2`,
            [req.user!.id, characterId, JSON.stringify(rerolled)],
          ).catch((e) => console.warn('[chat] arc disruption re-roll persist failed:', e));
        }
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
      if (!k.pendingDriveEvent) {
        newPendingEvent = pendingEventFromEmotions(emotions, characterId, displayName) ?? undefined;
      }
    }
    const driveReaction = (companionEntity?.knowledge.pendingDriveReaction as string | undefined) || '';

    // Step 1 — Referee: classify the player's action (cheap, fast LLM call).
    const refereeOut = await extractIntent(
      refereeInputFromWorld(world, message, turns),
      (prompt) => completePrompt(prompt, { json: true }),
    );
    effIntent = validateIntent(refereeOut.intent) ?? { type: 'observation', subtype: 'wait' };
    effectPlan = planEffects(consequencesFor(effIntent, world));
    const engineFacts = formatEngineFactsBlock(effectPlan, authority);

    const directives =
      formatSituationBlock(situation.state, scene, displayName, affinity) +
      sceneFacts +
      disruptionDirective +
      formatCharacterFactsBlock(getLore(characterId)) +
      formatPersonaTraitsBlock(getLore(characterId), { discovered: secretDiscovered, revealNow: revealSecretNow }) +
      ROLEPLAY_INPUT_DIRECTIVE +
      directorDisciplineDirective(displayName) +
      playerKnown +
      lookNote +
      agencyHint +
      emotionTone +
      (driveReaction ? `\n\n${driveReaction}` : '') +
      engineFacts +
      formatMemoryBlock(memories);

    directorPrompt = buildDirectorPrompt({
      companionSystem: getCharacter(characterId).systemPrompt,
      companionTag: companionTagFor(displayName),
      companionName: displayName,
      npcs,
      directives,
      history: turns,
      userMessage: message,
      arcContext,
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
    {
      // Step 2 — Director: narrate the scene (intent already classified; engine
      // facts are injected into the prompt). Degenerate output triggers one retry.
      const badReply = (lines: { text: string }[]) =>
        lines.length === 0 || lines.some((t) => looksDegenerate(t.text));
      const raw1 = await completePrompt(directorPrompt!, { json: true });
      let dirOut = parseDirectorOutput(raw1, displayName);
      if (badReply(dirOut.turns)) {
        const raw2 = await completePrompt(directorPrompt!, { json: true });
        dirOut = parseDirectorOutput(raw2, displayName);
        if (badReply(dirOut.turns)) {
          console.warn(
            `[chat] director output unusable twice (${characterId}); raw tail: …${(raw2 || raw1 || '').slice(-220)}`,
          );
        }
      }
      let dturns = dirOut.turns.some((t) => looksDegenerate(t.text)) ? [] : dirOut.turns;
      const arcResult = arcContext ? dirOut.arc : null;

      const plan = effectPlan!;
      const intent = effIntent!;
      const applied = await applyEffects(req.user!.id, characterId, plan);
      appliedAffinity = applied.affinityScore;
      worldEventFired = plan.warnings.length > 0;

      if (companionEntity && emotions) {
        emotions = applyEmotionDeltas(emotions, emotionDeltasForIntent(intent));
      }
      const moodShift = moodShiftForIntent(intent);
      if (moodShift) {
        void setMood(req.user!.id, characterId, moodShift).catch((e) => console.warn('[chat] mood update failed:', e));
      }

      // Prepend arc intro narrative as a narrator beat on the first turn of a new arc.
      const replyTurns = [
        ...(arcIntroNarrative ? [{ speaker: 'narrator', text: arcIntroNarrative }] : []),
        ...(dturns.length ? dturns : [{ speaker: displayName, text: 'Mm — say that again? You had me for a second there.' }]),
      ];
      assistantFull = turnsToTranscript(replyTurns);

      // --- Arc evaluation ---
      if (arcResult && activeArc) {
        const { arcStatus } = arcResult;
        if (arcStatus === 'completed' && !arcJustStarted && arcResult.earnedBadge) {
          // Minimum-turn guard: only accept completion after at least 3 player
          // turns since the arc started (prevents LLM false positives on turn 1).
          const startedAt = arcStateResult.activeArcStartedAt ?? new Date(0);
          const { rows: tcRows } = await pool.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM chat_messages
             WHERE user_id = $1 AND character_id = $2 AND role = 'user' AND created_at > $3`,
            [req.user!.id, characterId, startedAt],
          );
          const turnsSinceStart = Number(tcRows[0]?.n ?? 0);
          if (turnsSinceStart >= 2) {
            earnedBadge = arcResult.earnedBadge;
            void saveCompletedArc(req.user!.id, characterId, activeArc, earnedBadge).catch(() => {});
            void clearArcState(req.user!.id, characterId).catch(() => {});
          }
        } else if (arcStatus === 'abandoned') {
          const newStrikes = await incrementAbandonmentStrikes(req.user!.id, characterId);
          if (newStrikes >= 3) {
            void clearArcState(req.user!.id, characterId).catch(() => {});
          }
        } else if ((arcStatus === 'ongoing' || arcStatus === 'climax') && arcStateResult.abandonmentStrikes > 0) {
          void resetAbandonmentStrikes(req.user!.id, characterId).catch(() => {});
        }
      }
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

      // Disruption bookkeeping: mark it fired and persist any residue so the
      // world remembers the beat (the mystery text exists now).
      if (firedDisruption) {
        void markDisruptionFired(req.user!.id, characterId, firedDisruption.id).catch(() => {});
        const residue = disruptionResidue(firedDisruption, displayName, characterId);
        if (residue) void storeSignificantEvent(req.user!.id, characterId, residue);
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

    // Update long-term memory from this exchange. Fire-and-forget so it never delays the response.
    void extractAndStoreFacts({
      userId: req.user!.id,
      characterId,
      userMessage: message,
      assistantMessage: assistantFull,
    });

    // Affinity is driven by the engine (consequencesFor -> applyEffects).
    const newAffinityScore: number = appliedAffinity ?? affinity;

    // Bump usage only for free users so paid users have a clean 0/null state.
    let remaining: number | null = null;
    if (!(await isSubscribed(req.user!.id))) {
      const used = await incrementUsage(req.user!.id);
      remaining = Math.max(0, FREE_TIER_DAILY_LIMIT - used);
    }

    send('done', { remaining, affinityScore: newAffinityScore, earnedBadge });

    // Advance the living world a little each message (deterministic, no LLM, off the response path).
    void runLightTick(req.user!.id, { excludeId: characterId }).catch((e) => console.warn('[tick] light tick failed:', e));

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
