// SSE streaming chat endpoint.
// Flow:
//   1. Validate request body
//   2. Open SSE stream (text/event-stream)
//   3. Stream chunks from Inworld -> client as `event: chunk` events
//   4. On success, persist both turns + increment usage (free users only)
//   5. On error, send `event: error` and close
import { Router, type Request, type Response } from 'express';
import { buildProgressPayload } from './progress';
import { requireAuth } from '../middleware/auth';
import { enforceMessageQuota } from '../middleware/rateLimit';
import { streamChat, completePrompt, streamPrompt, type ChatMessage } from '../inworld/chat';
import { buildDirectorPrompt, buildDirectorPromptParts, parseDirectorOutput, parseDirectorTurns, companionTagFor, turnsToTranscript, type Actor, type ArcContext, type ReplyChoice } from '../inworld/director';
import { selectArc, getArc, type SceneAnchor, type StoryArc } from '../inworld/arcs';
import { getUserStory } from '../db/user_stories';
import { userStoryToArc } from '../inworld/user_arc';
import { resolveMeetFirstStoryArc, arcOpeningLine } from '../inworld/active_arc';
import { hasCompletedMeetArc, meetArcIdFor, MEET_AFFINITY_REWARD, meetArcReadyToComplete, resolveMeetCompletionBadge } from '../inworld/meet_arc';
import { resolveFreeRoamWindow, freeRoamWindowClause, type FreeRoamWindow } from '../db/chat_window';
import { sanitizeRoleplayTranscript } from '../inworld/transcript_sanitize';
import { ensureUserCharacterLoaded } from '../db/user_characters';
import { setArcActive, clearArc as clearArcState, incrementAbandonmentStrikes, resetAbandonmentStrikes, saveCompletedArc, getCompletedArcIds } from '../db/arc_state';
import { incrementAffinity } from '../db/affinity';
import { loadPlayerProgress } from '../db/player_progress';
import { getFullProfile, upsertProfile } from '../db/profile';
import { getNpcStates } from '../db/npc_state';
import { resolveAvailableActions, resolvePlayerAction } from '../sim/player_actions';
import type { PlayerAction } from '../sim/player_actions';
import { incrementUsage, FREE_TIER_DAILY_LIMIT } from '../db/usage';
import { isSubscribed } from '../db/subscriptions';
import { pool } from '../db/pool';
import {
  retrieveRelevantMemories,
  formatMemoryBlock,
  extractAndStoreFacts,
} from '../db/memory';
import {
  getCharacterStoryBeats,
  formatCharacterStoryBlock,
  recordStoryBeat,
} from '../db/story_memory';
import {
  readSceneSnapshot,
  writeSceneSnapshot,
  buildInitialSceneSnapshot,
  buildFreeRoamSceneSnapshot,
  formatSceneSnapshotBody,
  snapshotToSceneState,
  applySceneContinuityUpdate,
  type SceneSnapshot,
  type SceneSnapshotPatch,
} from '../inworld/scene_snapshot';
import { applyEngineSceneDelta } from '../db/scene_apply';
import {
  inferSceneDeltaFromConversation,
  shouldSuppressHomeBaseline,
  resolveCoPresentForPrompt,
  formatActiveSceneDirective,
  reconcileSceneSnapshotForPrompt,
  isCrisisScene,
  shouldSuppressEnvironmentalChaos,
} from '../sim/scene_prompt';
import {
  buildEngineSceneDelta,
  reapplyEngineLocks,
  engineDeltaLogLine,
  type EngineSceneDelta,
} from '../sim/scene_delta';
import {
  extractCompanionConditionFromMessage,
  inferCompanionConditionFromBeats,
  inferCompanionConditionFromConversation,
  mergeCompanionConditionPatches,
  finalizeCompanionConditionPatch,
} from '../inworld/scene_companion_condition';
import { formatStatusDirectiveBlock, enforceStatusOnTurns } from '../sim/status_effects';
import { resolvePresentation } from '../sim/scene_presentation';
import { loadSessionPresentation } from '../db/scene_presentation_load';
import { getUserCharacter } from '../db/user_characters';
import { getCharacter, isUserCharacter, type CharacterId } from '../inworld/characters';
import { getLocation, resolveVenueSlug } from '../inworld/locations';
import {
  formatSceneNpcBlock,
  mergeSceneNpcs,
  resolveSceneNpcs,
  sceneCastToNpcRefs,
  suggestBystanderForSetting,
} from '../inworld/npc_schema';
import { maybeAutonomousPost, postTriggerForTurn } from '../inworld/social_post';
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
import { getOrComposeScene, renderSceneHeader, renderSceneFactsBlock, markDisruptionFired, markNpcChaosFired } from '../db/scene_composition';
import type { SceneCastMember } from '../sim/scene_composer';
import {
  rerollUnfiredDisruptions,
  type PlannedDisruption,
} from '../sim/interruptions';
import { friendFor } from '../sim/scene_registry';
import { detectWorldEvent } from '../db/world_util';
import { buildSceneContext } from '../sim/scene_context';
import { planChaosTurn, chaosUiHint, formatChaosPromptBlock, chaosRequiredActors, type ChaosUiHint } from '../sim/chaos_engine';
import { npcEntityIdFromName } from '../sim/world_npcs';
import { formatSituationBlock, formatLocationBlock } from '../db/scene_util';
import { ROLEPLAY_INPUT_DIRECTIVE, directorDisciplineForPrompt } from '../db/roleplay_util';
import { assembleWorld } from '../db/sim_world';
import type { PlayerIntent } from '../sim/intent';
import { validateIntent } from '../sim/intent';
import type { WorldState, NpcEntity } from '../sim/world';
import { consequencesFor } from '../sim/rules';
import { planEffects, type EffectPlan } from '../sim/effects';
import { applyEffects } from '../db/sim_apply';
import { describeKnownPlayer, observePlayer, describeAppearance } from '../sim/player';
import { describeLastSeenOutfit, itemsById, wornItems, describeOutfit, describeGrooming } from '../sim/wardrobe';
import { upsertNpcState } from '../db/npc_state';
import { looksDegenerate, sanitizeEnglishDialogue } from '../llm/quality';
import { directorCompleteOpts, dialogueCompleteOpts } from '../llm/models';
import { buildDialoguePrompt } from '../inworld/dialogue';
import { streamingDirectorTranscript } from '../llm/stream_director';
import { budgetHistory } from '../llm/budget';
import {
  formatPersistentSceneDirective,
  resolveArcAct,
  sceneDirectiveFromAnchor,
  buildInitialSceneState,
  validateSceneStateUpdate,
  formatSceneValidationRetryHint,
  repairSceneStateCast,
  requiredCastNames,
  resolveArcNpcInstruction,
  type SceneDirectiveInput,
} from '../inworld/story_structure';

// Recent turns fed to the LLM for local coherence. Long-term recall comes from
// RAG memory (db/memory.ts), not from replaying a long transcript.
// Bigger window = the model can see (and is told to avoid) its own recent
// phrasing, which is the main lever against verbatim self-repetition.
const RECENT_TURNS_FOR_PROMPT = 14;


/** Formats a SceneAnchor as the authoritative "current setting" block, replacing
 *  formatSituationBlock() for arcs that place the companion and player together. */
function formatAnchorBlock(
  anchor: SceneAnchor,
  companionName: string,
  sceneCast: SceneCastMember[] = [],
): string {
  return formatPersistentSceneDirective(
    sceneDirectiveFromAnchor(
      anchor,
      companionName,
      sceneCast.map((m) => ({ name: m.name, description: `${m.role} — ${m.vibe}` })),
    ),
  );
}

const router = Router();

function meetIntroLine(arc: StoryArc | undefined): string | undefined {
  if (!arc) return undefined;
  const opening = arcOpeningLine(arc);
  return opening?.trim() ? `[NARRATOR] ${opening.trim()}` : undefined;
}

function historyIncludesMeetIntro(history: ChatMessage[], introLine: string): boolean {
  return history.some((m) => m.role === 'assistant' && m.content === introLine);
}

/** Persist meet-cute opening narration before the first greeting when missing. */
async function ensureMeetIntroPersisted(
  userId: string,
  characterId: string,
  introLine: string,
  history: ChatMessage[],
): Promise<ChatMessage[]> {
  if (historyIncludesMeetIntro(history, introLine)) return history;

  await pool.query(
    `INSERT INTO chat_messages (user_id, character_id, role, content, created_at)
     VALUES (
       $1, $2, 'assistant', $3,
       COALESCE(
         (SELECT MIN(created_at) - INTERVAL '1 millisecond'
          FROM chat_messages
          WHERE user_id = $1 AND character_id = $2 AND pack_session_id IS NULL),
         NOW()
       )
     )`,
    [userId, characterId, introLine],
  );

  return [{ role: 'assistant', content: introLine }, ...history];
}

interface ChatRequestBody {
  characterId: CharacterId;
  message?: string;
  /** Engine action id from GET /api/progress — resolves to canonical *action* text. */
  actionId?: string;
  actionPayload?: Record<string, unknown>;
}

router.post('/greet', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.body as { characterId: string };

  if (!characterId) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  // Preload a custom persona so the synchronous getCharacter() can resolve it.
  if (characterId.startsWith('user:')) {
    const ok = await ensureUserCharacterLoaded(characterId, req.user!.id);
    if (!ok) return res.status(404).json({ error: 'unknown_character' });
  }

  try {
    const userId = req.user!.id;
    const freeRoamWindow = await resolveFreeRoamWindow(userId, characterId);
    const completedArcIds = await getCompletedArcIds(userId, characterId);
    const meetArcComplete = hasCompletedMeetArc(characterId, completedArcIds);
    const { arc: activeArc } = await resolveMeetFirstStoryArc(userId, characterId, completedArcIds);

    // Opening scene: use the active story arc when one is running; otherwise free-roam compose.
    let sceneHeader: string | undefined;
    let activeStoryArc: { id: string; title: string } | undefined;
    try {
      const character = getCharacter(characterId);
      if (activeArc?.sceneAnchor) {
        sceneHeader = arcOpeningLine(activeArc);
        // Studio arc banner only after meet-cute — never overlay a stale Play session.
        if (meetArcComplete && activeArc.id.startsWith('user:')) {
          const story = await getUserStory(activeArc.id.slice('user:'.length));
          if (story && story.ownerUserId === userId) {
            activeStoryArc = { id: activeArc.id, title: story.title };
          }
        }
      } else if (meetArcComplete) {
        const situation = await getSituation(userId, characterId);
        const comp = await getOrComposeScene(userId, characterId, character.displayName, situation);
        if (comp) sceneHeader = renderSceneHeader(comp, character.displayName, characterId);
      }
    } catch (sceneErr) {
      console.warn('[chat] scene composition failed:', sceneErr);
    }

    // Check for existing history in the live window (today, or since arc start).
    const windowClause = freeRoamWindowClause(freeRoamWindow, 3);
    const { rows } = await pool.query(
      `SELECT 1 FROM chat_messages
       WHERE user_id = $1 AND character_id = $2 AND pack_session_id IS NULL${windowClause.sql}
       LIMIT 1`,
      [userId, characterId, ...windowClause.params],
    );

    const rpgPayload = await buildProgressPayload(userId, characterId).catch(() => null);
    const rpgExtras = rpgPayload
      ? {
          actions: rpgPayload.actions,
          mapLocations: rpgPayload.mapLocations,
          progress: rpgPayload.progress,
          currentVenueSlug: rpgPayload.currentVenueSlug,
        }
      : {};

    if (rows.length > 0) {
      let history = await loadHistory(userId, characterId, freeRoamWindow);
      if (!meetArcComplete) {
        const introLine = meetIntroLine(activeArc);
        if (introLine) {
          history = await ensureMeetIntroPersisted(userId, characterId, introLine, history);
        }
      }
      const presentation = await loadSessionPresentation(userId, characterId).catch(() => null);
      return res.json({
        hasHistory: true,
        history,
        sceneHeader: meetArcComplete ? sceneHeader : undefined,
        activeStoryArc,
        arcActive: meetArcComplete && !!activeArc?.sceneAnchor,
        meetArcComplete,
        presentation,
        ...rpgExtras,
      });
    }

    // First contact with no history: skip the meet-cute greeting when a Studio arc is active.
    if (meetArcComplete && activeArc?.sceneAnchor) {
      const presentation = await loadSessionPresentation(userId, characterId).catch(() => null);
      return res.json({ hasHistory: false, sceneHeader, activeStoryArc, arcActive: true, meetArcComplete, presentation, ...rpgExtras });
    }

    const character = getCharacter(characterId);
    const greetingText = character.greeting;
    const introLine = meetIntroLine(activeArc);

    if (introLine) {
      await pool.query(
        `INSERT INTO chat_messages (user_id, character_id, role, content)
         VALUES ($1, $2, 'assistant', $3)`,
        [userId, characterId, introLine],
      );
    }

    await pool.query(
      `INSERT INTO chat_messages (user_id, character_id, role, content)
       VALUES ($1, $2, 'assistant', $3)`,
      [userId, characterId, greetingText],
    );

    const presentation = await loadSessionPresentation(userId, characterId).catch(() => null);
    return res.json({ hasHistory: false, greeting: greetingText, sceneHeader, activeStoryArc, meetArcComplete, presentation, ...rpgExtras });
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
       WHERE user_id = $1 AND character_id = $2 AND pack_session_id IS NULL
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

// Transcript for one archived calendar day (read-only history view).
router.get('/history/:characterId/:day', requireAuth, async (req: Request, res: Response) => {
  const { characterId, day } = req.params;
  if (!characterId || !/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  try {
    const { rows } = await pool.query<{ role: 'user' | 'assistant'; content: string }>(
      `SELECT role, content FROM chat_messages
       WHERE user_id = $1 AND character_id = $2 AND pack_session_id IS NULL
         AND created_at::date = $3::date
       ORDER BY created_at ASC, id ASC`,
      [req.user!.id, characterId, day],
    );
    return res.json({ day, messages: rows });
  } catch (err) {
    console.error('[chat] history day error:', err);
    return res.status(500).json({ error: 'history_failed' });
  }
});

// Legacy multi-actor director turn (scene/story/event-driven, multi-speaker JSON
// output). Decoupled — no longer wired to a route. The engine now owns the world
// and the LLM only voices one character; see streamDialogueTurn below. Kept in the
// tree so the arc/pack/chaos/scene machinery can be revisited later if needed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function legacyDirectorStream(req: Request, res: Response) {
  const body = req.body as ChatRequestBody;
  const { characterId, actionId } = body;
  let message = typeof body.message === 'string' ? body.message.trim() : '';

  // --- Validate ---
  if (!characterId || (!message && !actionId)) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  let actionScenePatch: SceneSnapshotPatch | null = null;

  if (actionId) {
    const userId = req.user!.id;
    const [progress, profile, npcMap] = await Promise.all([
      loadPlayerProgress(userId, characterId),
      getFullProfile(userId),
      getNpcStates(userId, [characterId]),
    ]);
    let companionName = characterId;
    try {
      companionName = getCharacter(characterId).displayName;
    } catch {
      /* custom */
    }
    const priorForAction = readSceneSnapshot(
      (npcMap[characterId]?.knowledge ?? {}) as Record<string, unknown>,
    );
    const resolved = resolvePlayerAction(actionId, {
      snapshot: priorForAction,
      progress,
      inventory: profile.inventory,
      wornItemIds: profile.presentation.wornItemIds ?? [],
      companionName,
      characterId,
      currentVenueSlug: priorForAction?.venueSlug ?? null,
    });
    if (!resolved) {
      return res.status(400).json({ error: 'invalid_action' });
    }
    message = resolved.message;
    actionScenePatch = resolved.scenePatch ?? null;

    if (actionId.startsWith('inventory.equip:')) {
      const itemId = actionId.slice('inventory.equip:'.length);
      const worn = [...(profile.presentation.wornItemIds ?? [])];
      if (!worn.includes(itemId)) worn.push(itemId);
      await upsertProfile(userId, {
        displayName: profile.profile.displayName,
        wornItemIds: worn,
      });
    }
  }

  if (message.length === 0) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  if (message.length > 4000) {
    return res.status(400).json({ error: 'message_too_long', max: 4000 });
  }

  // Preload a custom persona so the synchronous getCharacter() (used throughout
  // the pipeline) can resolve it for this request.
  if (characterId.startsWith('user:')) {
    const ok = await ensureUserCharacterLoaded(characterId, req.user!.id);
    if (!ok) return res.status(404).json({ error: 'unknown_character' });
  }

  // Recent window for local coherence; long-term recall is handled by RAG.
  // budgetHistory keeps the newest turns verbatim and snips older ones so the
  // window never blows up the per-message token bill.
  const turns: ChatMessage[] = budgetHistory(
    await loadRecentTurns(req.user!.id, characterId, RECENT_TURNS_FOR_PROMPT, await resolveFreeRoamWindow(req.user!.id, characterId)),
  );

  // Retrieve long-term memories relevant to this message, and score hostility,
  // both in parallel with setup so they add no user-visible latency.
  const memoriesPromise = retrieveRelevantMemories({
    userId: req.user!.id,
    queryText: message,
    characterId,
  });
  const storyBeatsPromise = getCharacterStoryBeats(req.user!.id, characterId);
  // Current situation = daily story state + dating scene (on a date or at home).
  // Lazily generated if it's a new day; never throws.
  const situationPromise = getSituation(req.user!.id, characterId);
  const playerProgressPromise = loadPlayerProgress(req.user!.id, characterId);

  // Gate the prompt on these before streaming.
  const [situation, memories, storyBeats, playerProgress] = await Promise.all([
    situationPromise,
    memoriesPromise,
    storyBeatsPromise,
    playerProgressPromise,
  ]);

  const affinity = playerProgress.affinity;
  const arcStateResult = {
    currentArcId: playerProgress.activeArcId,
    activeArcStartedAt: playerProgress.activeArcStartedAt,
  };
  const completedArcIds = new Set(playerProgress.completedArcIds);

  let arcContext: ArcContext | undefined;
  let arcJustStarted = false;
  let arcSceneInit = false;
  let arcIntroNarrative: string | undefined;
  let earnedBadge: { title: string; description: string } | null = null;
  let completedArcIdForPost: string | null = null;
  let affinityAwarded = 0;

  // --- Arc selection / continuation ---
  // If one is active, load it (a "user:<id>" ref is a player-authored Studio
  // arc, loaded from the DB; otherwise it's a built-in arc). If none is running,
  // auto-select a built-in one. Meet-cute always wins until completed.
  const meetComplete = hasCompletedMeetArc(characterId, completedArcIds);
  const priorArcId = arcStateResult.currentArcId;
  let activeArc: StoryArc | null = null;
  let onUserArc = false;

  if (!meetComplete && getArc(meetArcIdFor(characterId))) {
    const resolved = await resolveMeetFirstStoryArc(req.user!.id, characterId, completedArcIds);
    activeArc = resolved.arc;
    arcJustStarted = priorArcId !== resolved.arcId;
  } else if (priorArcId?.startsWith('user:')) {
    onUserArc = true;
    if (!meetComplete) {
      await clearArcState(req.user!.id, characterId).catch(() => {});
      onUserArc = false;
    } else {
      try {
        const story = await getUserStory(priorArcId.slice('user:'.length));
        if (story && story.ownerUserId === req.user!.id) activeArc = userStoryToArc(story);
      } catch (e) { console.warn('[chat] user arc load failed:', e); }
      if (!activeArc) {
        await clearArcState(req.user!.id, characterId).catch(() => {});
        onUserArc = false;
      }
    }
  } else if (priorArcId) {
    activeArc = getArc(priorArcId);
  }
  if (!activeArc && !onUserArc) {
    const candidate = selectArc(characterId, completedArcIds, null);
    if (candidate) {
      await setArcActive(req.user!.id, characterId, candidate.id);
      activeArc = candidate;
      arcJustStarted = true;
      if (!candidate.isMeetArc && candidate.introNarrative?.trim()) {
        arcIntroNarrative = candidate.introNarrative;
      }
    }
  }
  if (activeArc) {
    arcContext = {
      npcInstruction: activeArc.npcInstruction,
      completionCriteria: activeArc.completionCriteria,
      completionExamples: activeArc.completionExamples,
      isMeetArc: !!activeArc.isMeetArc,
    };
    // Studio / user arcs: prepend intro on the first user turn unless Play already seeded it.
    if (priorArcId?.startsWith('user:') && activeArc.introNarrative?.trim()) {
      const startedAt = arcStateResult.activeArcStartedAt ?? new Date(0);
      const { rows: userTurnRows } = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM chat_messages
         WHERE user_id = $1 AND character_id = $2 AND role = 'user'
           AND pack_session_id IS NULL AND created_at > $3::timestamptz`,
        [req.user!.id, characterId, startedAt],
      );
      if (Number(userTurnRows[0]?.n ?? 0) === 0) {
        const introNeedle = `[NARRATOR] ${activeArc.introNarrative.trim().slice(0, 80)}`;
        const { rows: seeded } = await pool.query(
          `SELECT 1 FROM chat_messages
           WHERE user_id = $1 AND character_id = $2 AND role = 'assistant'
             AND content LIKE $3 AND created_at > $4::timestamptz
           LIMIT 1`,
          [req.user!.id, characterId, `${introNeedle}%`, startedAt],
        );
        if (seeded.length === 0) arcIntroNarrative = activeArc.introNarrative;
      }
      if (Number(userTurnRows[0]?.n ?? 0) === 0 && activeArc.sceneAnchor) {
        arcSceneInit = true;
      }
    }
  }
  let displayName = characterId;
  try { displayName = getCharacter(characterId).displayName; } catch { /* unknown id */ }

  const scene = situation.scene;

  let directorPrompt: string | undefined;
  let directorSystem = '';
  let chatDirectives = '';
  let npcs: Actor[] = [];
  let chaosPromptBlock = '';
  let priorSceneStateForValidation = '';
  let priorSceneSnapshot: SceneSnapshot | null = null;
  let sceneSnapshotSeed: SceneSnapshot | null = null;
  let sceneValidationInput: SceneDirectiveInput | null = null;
  let world: WorldState | undefined;
  let companionEntity: NpcEntity | undefined;
  let revealSecretNow = false;
  let emotions: EmotionState | undefined;
  let firedDisruption: PlannedDisruption | null = null;
  let firedNpcChaosKey: string | null = null;
  let chaosResidues: string[] = [];
  let chaosHint: ChaosUiHint | null = null;
  let newPendingEvent: DriveEventCard | undefined;
  let appliedAffinity: number | null = null;
  let effIntent: PlayerIntent | undefined;
  let effectPlan: EffectPlan | undefined;
  let engineSceneDelta: EngineSceneDelta | null = null;
  let suppressHomeBaseline = false;
  let availableActions: PlayerAction[] = [];
  {
    // === Single LLM: director classifies intent + narrates. Engine owns affinity,
    // scene locks, chaos, secrets, and NPC scheduling before/after the call.
    world = await assembleWorld(req.user!.id, characterId);
    companionEntity = world.npcs[characterId];
    priorSceneSnapshot = readSceneSnapshot(companionEntity?.knowledge as unknown as Record<string, unknown> | undefined);

    npcs = [];

    // Composed scene: authoritative time/setting/outfit facts + anyone else
    // present (e.g. her friend) registered as a voiceable actor. Fail-soft.
    let sceneFacts = '';
    let sceneCast: SceneCastMember[] = [];
    let sceneNpcBlock = '';
    let chaosDirective = '';
    let sceneTurn = 1;
    let sceneComp = null as Awaited<ReturnType<typeof getOrComposeScene>>;
    try {
      sceneComp = await getOrComposeScene(req.user!.id, characterId, displayName, situation);
      if (sceneComp) {
        sceneFacts = renderSceneFactsBlock(sceneComp, displayName, characterId, {
          suppressFirstMeeting: !!activeArc?.sceneAnchor || !!situation.scene.location,
        });
        sceneCast = sceneComp.cast;

        const { rows: turnRows } = await pool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM chat_messages
           WHERE user_id = $1 AND character_id = $2 AND role = 'user' AND created_at > $3::timestamptz`,
          [req.user!.id, characterId, sceneComp.composedAt],
        );
        sceneTurn = Number(turnRows[0]?.n ?? 0) + 1;

        // When a new arc just activated, re-bias the remaining unfired
        // disruption slots toward thematically resonant events.
        if (arcJustStarted && activeArc && (sceneComp.disruptions ?? []).length > 0) {
          const firedIds = new Set(sceneComp.firedDisruptions ?? []);
          const rerolled = rerollUnfiredDisruptions(
            sceneComp.disruptions ?? [],
            firedIds,
            activeArc.arcTags,
            { phase: 'home', hasFriend: (sceneComp.cast ?? []).length > 0 },
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
          sceneComp = { ...sceneComp, disruptions: rerolled };
        }
      }
    } catch (sceneErr) {
      console.warn('[chat] scene facts failed:', sceneErr);
    }

    const settingHint =
      activeArc?.sceneAnchor?.setting ??
      (situation.scene.location ? getLocation(situation.scene.location)?.name : undefined) ??
      '';
    const venueNpc =
      situation.scene.location && settingHint
        ? suggestBystanderForSetting(settingHint)
        : null;
    const chaosNpcRefs = [
      ...sceneCastToNpcRefs(sceneCast),
      ...(activeArc?.npcs ?? []),
    ];
    // Remote free-roam: ensure at least one off-scene friend exists for chaos
    // (phone/text beats) when the composed cast and arc roster are empty.
    if (
      !situation.scene.location &&
      !activeArc?.sceneAnchor?.coPresent &&
      !chaosNpcRefs.some((n) => n.stance === 'friend' || n.stance === 'enemy')
    ) {
      const f = friendFor(characterId);
      chaosNpcRefs.push({
        name: f.name,
        stance: 'friend',
        archetypeId: 'companion_best_friend',
        description: f.vibe,
      });
    }
    const resolvedSceneNpcs = mergeSceneNpcs([
      resolveSceneNpcs(chaosNpcRefs),
      venueNpc ? [venueNpc] : [],
    ]);
    sceneNpcBlock = formatSceneNpcBlock(resolvedSceneNpcs);
    for (const n of resolvedSceneNpcs) {
      npcs.push({
        tag: n.speakerTag,
        name: n.name,
        kind: 'npc',
        brief: `[${n.stance}] ${n.promptBrief}`,
      });
    }

    // Chaos engine: ambient disruptions + NPC agency + schema-weighted chaos.
    const sceneCtx = buildSceneContext({
      world,
      composition: sceneComp,
      resolvedNpcs: resolvedSceneNpcs,
      activeArc: activeArc ?? null,
      turn: sceneTurn,
      companionId: characterId,
      companionName: displayName,
      atVenue: Boolean(situation.scene.location),
      coPresent: priorSceneSnapshot?.coPresent ?? !!situation.scene.location,
      suppressAmbientDisruptions: isCrisisScene(priorSceneSnapshot, turns, message),
      suppressEnvironmentalChaos: shouldSuppressEnvironmentalChaos(priorSceneSnapshot, turns, message),
    });
    const worldEvent = detectWorldEvent(message);
    const chaos = planChaosTurn(sceneCtx, { worldEvent });
    chaosDirective = chaos.directiveBlock;
    firedDisruption = chaos.firedDisruption;
    firedNpcChaosKey = chaos.firedNpcChaosKey;
    chaosResidues = chaos.residues;
    for (const extra of chaosRequiredActors(chaos, characterId, resolvedSceneNpcs)) {
      if (!npcs.some((a) => a.tag === extra.tag)) {
        npcs.push({ tag: extra.tag, name: extra.name, kind: 'npc', brief: extra.brief });
      }
    }
    chaosHint = chaosUiHint(chaos, {
      companionName: displayName,
      characterId,
      resolvedNpcs: resolvedSceneNpcs,
      worldEvent,
    });

    for (const act of chaos.agencyActions) {
      if (act.npc === characterId) continue;
      const resolved = resolvedSceneNpcs.find((n) => npcEntityIdFromName(n.name) === act.npc);
      if (resolved) {
        npcs.push({
          tag: resolved.speakerTag,
          name: resolved.name,
          kind: 'npc',
          brief: `${act.action.replace(/_/g, ' ')} — ${act.reason}`,
        });
      } else {
        const other = world.npcs[act.npc];
        npcs.push({
          tag: (other?.name ?? act.npc).toUpperCase(),
          name: other?.name ?? act.npc,
          kind: 'npc',
          brief: `${act.action.replace(/_/g, ' ')} — ${act.reason}`,
        });
      }
    }

    // What the companion knows about the player (perception-gated).
    const playerKnown = companionEntity ? describeKnownPlayer(world.user.profile, companionEntity) : '';

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

    const messageCompanionPatch = extractCompanionConditionFromMessage(message, displayName, priorSceneSnapshot);
    const conversationScenePatch = {
      ...inferSceneDeltaFromConversation(turns, message, priorSceneSnapshot),
      ...finalizeCompanionConditionPatch(
        priorSceneSnapshot,
        mergeCompanionConditionPatches(
          inferCompanionConditionFromBeats(storyBeats, displayName, {
            skipIfCleared:
              messageCompanionPatch.companionVoice === 'free' || messageCompanionPatch.companionMobility === 'free',
          }),
          inferCompanionConditionFromConversation(turns, message, displayName, priorSceneSnapshot),
          messageCompanionPatch,
        ),
      ),
      ...(actionScenePatch ?? {}),
    };

    if (arcContext && activeArc) {
      const startedAt = arcStateResult.activeArcStartedAt ?? new Date(0);
      const { rows: arcTurnRows } = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM chat_messages
         WHERE user_id = $1 AND character_id = $2 AND role = 'user'
           AND pack_session_id IS NULL AND created_at > $3::timestamptz`,
        [req.user!.id, characterId, startedAt],
      );
      arcContext.storyAct = resolveArcAct({
        userTurnsSinceStart: Number(arcTurnRows[0]?.n ?? 0),
        isMeetArc: !!activeArc.isMeetArc,
      });
      arcContext.npcInstruction = resolveArcNpcInstruction(
        activeArc.npcInstruction,
        activeArc.phaseInstructions,
        arcContext.storyAct,
      );
    }

    const lore = getLore(characterId);
    const lorePromptExtras = isUserCharacter(characterId)
      ? revealSecretNow
        ? `\n\nThe player has earned your trust and is asking directly — reveal your secret now, in your own voice.`
        : secretDiscovered
          ? `\n\nYour secret is already known to the player; you can speak about it openly.`
          : ''
      : formatCharacterFactsBlock(lore) +
        formatPersonaTraitsBlock(lore, { discovered: secretDiscovered, revealNow: revealSecretNow });

    if (activeArc?.sceneAnchor) {
      sceneValidationInput = sceneDirectiveFromAnchor(
        activeArc.sceneAnchor,
        displayName,
        sceneCast.map((m) => ({ name: m.name, description: `${m.role} — ${m.vibe}` })),
      );
    }

    if (sceneValidationInput && (arcJustStarted || arcSceneInit) && !priorSceneSnapshot) {
      sceneSnapshotSeed = buildInitialSceneSnapshot(sceneValidationInput);
      priorSceneSnapshot = sceneSnapshotSeed;
    } else if (!priorSceneSnapshot && !activeArc?.sceneAnchor) {
      priorSceneSnapshot = buildFreeRoamSceneSnapshot({
        companionName: displayName,
        location: situation.scene.location ?? null,
        venueSlug: situation.scene.location ? resolveVenueSlug(situation.scene.location) : null,
        coPresent: !!situation.scene.location,
        extraPresent: sceneCast.map((m) => m.name),
      });
    }

    engineSceneDelta = buildEngineSceneDelta({
      message,
      intent: { type: 'observation', subtype: 'wait' },
      prior: priorSceneSnapshot,
      world: world!,
      conversation: conversationScenePatch,
      allowLocationChange: !activeArc?.sceneAnchor,
      companionName: displayName,
    });
    if (engineSceneDelta) {
      const preDirector = await applyEngineSceneDelta(
        req.user!.id,
        characterId,
        priorSceneSnapshot,
        engineSceneDelta,
      );
      priorSceneSnapshot = preDirector.snapshot;
      console.log(
        `[scene_delta] ${engineDeltaLogLine(engineSceneDelta)} user=${req.user!.id} character=${characterId}`,
      );
    }

    if (priorSceneSnapshot) {
      priorSceneSnapshot = reconcileSceneSnapshotForPrompt(priorSceneSnapshot, turns, message);
    }

    suppressHomeBaseline = shouldSuppressHomeBaseline({
      prior: priorSceneSnapshot,
      history: turns,
      message,
      storyBeats,
    });
    const settingBlock = suppressHomeBaseline
      ? formatActiveSceneDirective(priorSceneSnapshot)
      : activeArc?.sceneAnchor
        ? formatAnchorBlock(activeArc.sceneAnchor, displayName, sceneCast)
        : situation.scene.location
          ? formatLocationBlock(situation.scene.location, displayName, affinity)
          : formatSituationBlock(situation.state, scene, displayName, affinity);

    const coPresentForPrompt = resolveCoPresentForPrompt({
      prior: priorSceneSnapshot,
      sceneAnchorCoPresent: activeArc?.sceneAnchor?.coPresent,
      suppressHomeBaseline,
      atVenue: Boolean(situation.scene.location),
    });
    let lookNote = '';
    if (companionEntity) {
      const lastOutfit = describeLastSeenOutfit(companionEntity.knowledge.lastSeenOutfit, 'player', itemsById(world.user.inventory));
      if (coPresentForPrompt && lastOutfit) {
        lookNote = `\n\nLAST TIME YOU SAW THE PLAYER they were wearing ${lastOutfit}; you do not know if that has changed. Do NOT invent a different outfit.`;
      } else if (!coPresentForPrompt) {
        lookNote = `\n\nYou are apart and cannot see the player — do NOT invent what they are wearing.`;
      }
    }

    directorSystem =
      getCharacter(characterId).systemPrompt +
      ROLEPLAY_INPUT_DIRECTIVE +
      directorDisciplineForPrompt(displayName);

    chatDirectives =
      settingBlock +
      (suppressHomeBaseline ? '' : sceneFacts) +
      sceneNpcBlock +
      lorePromptExtras +
      playerKnown +
      lookNote +
      formatStatusDirectiveBlock(priorSceneSnapshot, displayName) +
      emotionTone +
      (driveReaction ? `\n\n${driveReaction}` : '') +
      formatMemoryBlock(memories) +
      formatCharacterStoryBlock(displayName, storyBeats);

    priorSceneStateForValidation = priorSceneSnapshot
      ? formatSceneSnapshotBody(priorSceneSnapshot).trim()
      : (() => {
          let prior = (companionEntity?.knowledge.sceneState as string | undefined) ?? '';
          if ((arcJustStarted || arcSceneInit) && activeArc?.sceneAnchor && !prior.trim() && sceneValidationInput) {
            prior = buildInitialSceneState(sceneValidationInput);
          }
          return prior;
        })();

    chaosPromptBlock = formatChaosPromptBlock(
      chaosDirective,
      displayName,
      chaosRequiredActors(chaos, characterId, resolvedSceneNpcs).map((a) => a.name),
    );

    directorPrompt = buildDirectorPrompt({
      companionSystem: directorSystem,
      companionTag: companionTagFor(displayName),
      companionName: displayName,
      npcs,
      directives: chatDirectives,
      history: turns,
      userMessage: message,
      playerName: world?.user.profile.displayName ?? '',
      priorSceneState: priorSceneStateForValidation,
      arcContext,
      chaosDirective: chaosPromptBlock || undefined,
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
  let replyChoices: ReplyChoice[] = [];
  const venueSlugBefore = priorSceneSnapshot?.venueSlug ?? null;
  const roomIdBefore = priorSceneSnapshot?.roomId ?? null;
  let finalSceneSnapshot: SceneSnapshot | null = priorSceneSnapshot;
  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    {
      // Director: classify intent + narrate in one streamed call.
      const badReply = (lines: { text: string }[]) =>
        lines.length === 0 || lines.some((t) => looksDegenerate(t.text));
      const dirParts = buildDirectorPromptParts({
        companionSystem: directorSystem,
        companionTag: companionTagFor(displayName),
        companionName: displayName,
        npcs,
        directives: chatDirectives,
        history: turns,
        userMessage: message,
        playerName: world?.user.profile.displayName ?? '',
        priorSceneState: priorSceneStateForValidation,
        arcContext,
        chaosDirective: chaosPromptBlock || undefined,
      });
      const dirOpts = {
        ...directorCompleteOpts(),
        system: dirParts.system,
        user: dirParts.user,
      };

      let raw1 = '';
      let streamedChars = 0;
      try {
        for await (const delta of streamPrompt('', dirOpts)) {
          if (abortController.signal.aborted) break;
          raw1 += delta;
          const partial = sanitizeRoleplayTranscript(streamingDirectorTranscript(raw1, displayName));
          if (partial.length > streamedChars) {
            send('chunk', { text: partial.slice(streamedChars) });
            streamedChars = partial.length;
          }
        }
      } catch (streamErr) {
        console.warn('[chat] director stream failed; falling back to complete:', streamErr);
        raw1 = await completePrompt('', dirOpts);
      }
      if (!raw1.trim()) raw1 = await completePrompt('', dirOpts);

      let dirOut = parseDirectorOutput(raw1, displayName);
      if (badReply(dirOut.turns)) {
        const raw2 = await completePrompt('', dirOpts);
        dirOut = parseDirectorOutput(raw2, displayName);
        if (badReply(dirOut.turns)) {
          console.warn(
            `[chat] director output unusable twice (${characterId}); raw tail: …${(raw2 || raw1 || '').slice(-220)}`,
          );
        }
      }

      const narratorTextsForScene = dirOut.turns
        .filter((t) => t.speaker.toLowerCase() === 'narrator')
        .map((t) => t.text);
      let continuity = applySceneContinuityUpdate({
        priorSnapshot: priorSceneSnapshot,
        sceneSnapshotPatch: dirOut.sceneSnapshotPatch,
        sceneStateProse: dirOut.sceneState,
        narratorTexts: narratorTextsForScene,
        requiredNames: sceneValidationInput ? requiredCastNames(sceneValidationInput) : [],
        seedSnapshot: sceneSnapshotSeed,
        companionName: displayName,
      });
      continuity.snapshot = reapplyEngineLocks(continuity.snapshot, engineSceneDelta);
      continuity.sceneState = snapshotToSceneState(continuity.snapshot);
      dirOut.sceneState = continuity.sceneState;
      finalSceneSnapshot = continuity.snapshot;

      effIntent = validateIntent(dirOut.intent) ?? { type: 'observation', subtype: 'wait' };
      effectPlan = planEffects(consequencesFor(effIntent, world!));

      const postIntentDelta = buildEngineSceneDelta({
        message: '',
        intent: effIntent,
        prior: continuity.snapshot,
        world: world!,
        allowLocationChange: !activeArc?.sceneAnchor,
      });
      if (postIntentDelta) {
        const postApply = await applyEngineSceneDelta(
          req.user!.id,
          characterId,
          continuity.snapshot,
          postIntentDelta,
        );
        continuity.snapshot = reapplyEngineLocks(postApply.snapshot, postIntentDelta);
        continuity.sceneState = snapshotToSceneState(continuity.snapshot);
        dirOut.sceneState = continuity.sceneState;
        priorSceneSnapshot = continuity.snapshot;
        finalSceneSnapshot = continuity.snapshot;
      }

      // Scene-state validation for structured stories (active arc with scene anchor).
      if (sceneValidationInput && dirOut.sceneState) {
        let check = validateSceneStateUpdate({
          priorSceneState: priorSceneStateForValidation,
          nextSceneState: dirOut.sceneState,
          requiredNames: requiredCastNames(sceneValidationInput),
          narratorTexts: narratorTextsForScene,
        });
        if (!check.ok) {
          const rawFix = await completePrompt(
            '',
            { ...dirOpts, user: dirOpts.user + formatSceneValidationRetryHint(check) },
          );
          dirOut = parseDirectorOutput(rawFix, displayName);
          const fixNarrator = dirOut.turns
            .filter((t) => t.speaker.toLowerCase() === 'narrator')
            .map((t) => t.text);
          let fixContinuity = applySceneContinuityUpdate({
            priorSnapshot: priorSceneSnapshot,
            sceneSnapshotPatch: dirOut.sceneSnapshotPatch,
            sceneStateProse: dirOut.sceneState,
            narratorTexts: fixNarrator,
            requiredNames: requiredCastNames(sceneValidationInput),
            seedSnapshot: sceneSnapshotSeed,
            companionName: displayName,
          });
          fixContinuity.snapshot = reapplyEngineLocks(fixContinuity.snapshot, engineSceneDelta);
          fixContinuity.sceneState = snapshotToSceneState(fixContinuity.snapshot);
          dirOut.sceneState = fixContinuity.sceneState;
          continuity = fixContinuity;
          finalSceneSnapshot = continuity.snapshot;
          check = validateSceneStateUpdate({
            priorSceneState: priorSceneStateForValidation,
            nextSceneState: dirOut.sceneState,
            requiredNames: requiredCastNames(sceneValidationInput),
            narratorTexts: fixNarrator,
          });
          if (!check.ok && check.droppedCharacters?.length) {
            dirOut.sceneState = repairSceneStateCast(
              dirOut.sceneState,
              check.droppedCharacters,
              priorSceneStateForValidation,
            );
          }
        }
      }

      let dturns = dirOut.turns.some((t) => looksDegenerate(t.text)) ? [] : dirOut.turns;
      dturns = enforceStatusOnTurns(dturns, displayName, continuity.snapshot);
      const arcResult = arcContext ? dirOut.arc : null;
      replyChoices = dirOut.choices ?? [];
      if (dirOut.memorable) {
        recordStoryBeat(req.user!.id, characterId, { summary: dirOut.memorable, source: 'memorable' });
      }

      const plan = effectPlan!;
      const intent = effIntent!;
      const applied = await applyEffects(req.user!.id, characterId, plan);
      appliedAffinity = applied.affinityScore;

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
      assistantFull = sanitizeRoleplayTranscript(turnsToTranscript(replyTurns));

      // --- Arc evaluation ---
      if (arcResult && activeArc) {
        const startedAt = arcStateResult.activeArcStartedAt ?? new Date(0);
        const { rows: tcRows } = await pool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM chat_messages
           WHERE user_id = $1 AND character_id = $2 AND role = 'user' AND created_at > $3`,
          [req.user!.id, characterId, startedAt],
        );
        const userTurnsSinceStart = Number(tcRows[0]?.n ?? 0) + 1;

        let arcStatus = arcResult.arcStatus;
        if (
          activeArc.isMeetArc &&
          !arcJustStarted &&
          arcStatus !== 'completed' &&
          meetArcReadyToComplete({
            userTurnsSinceStart,
            playerDisplayName: world?.user.profile.displayName ?? '',
            companionName: displayName,
            recentText: [...turns, { role: 'user' as const, content: message }]
              .slice(-14)
              .map((m) => m.content)
              .join('\n'),
            currentUserMessage: message,
          })
        ) {
          arcStatus = 'completed';
        }

        const completionBadge = activeArc.isMeetArc
          ? resolveMeetCompletionBadge(activeArc, arcResult.earnedBadge)
          : arcResult.earnedBadge;
        if (arcStatus === 'completed' && !arcJustStarted && completionBadge) {
          if (userTurnsSinceStart >= 2) {
            earnedBadge = completionBadge;
            completedArcIdForPost = activeArc.id;
            void saveCompletedArc(req.user!.id, characterId, activeArc, earnedBadge).catch(() => {});
            void clearArcState(req.user!.id, characterId).catch(() => {});
            if (activeArc.isMeetArc) {
              affinityAwarded = MEET_AFFINITY_REWARD;
              replyChoices = [];
            }
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
      if (!abortController.signal.aborted) {
        const finalTranscript = sanitizeRoleplayTranscript(turnsToTranscript(replyTurns));
        if (finalTranscript.length > streamedChars) {
          send('chunk', { text: finalTranscript.slice(streamedChars) });
        }
      }

      // Perception update for NEXT turn: companion learns name/bio, and outfit when co-present.
      if (companionEntity) {
        const learnedFacts = observePlayer({
          coPresent: resolveCoPresentForPrompt({
            prior: continuity.snapshot,
            sceneAnchorCoPresent: activeArc?.sceneAnchor?.coPresent,
            suppressHomeBaseline,
            atVenue: Boolean(situation.scene.location),
          }),
          message,
          profile: world!.user.profile,
          existingFacts: companionEntity.knowledge.knownPlayerFacts,
        });
        const lastSeenOutfit = companionEntity.knowledge.lastSeenOutfit;
        const knowledgePatch: Record<string, unknown> = {
          ...companionEntity.knowledge,
          knownPlayerFacts: learnedFacts,
          lastSeenOutfit,
          emotions: emotions ?? companionEntity.knowledge.emotions,
          emotionsUpdatedAt: new Date().toISOString(),
          pendingDriveEvent: newPendingEvent ?? companionEntity.knowledge.pendingDriveEvent ?? null,
          pendingDriveReaction: null,
          sceneState: continuity.sceneState,
          sceneSnapshot: writeSceneSnapshot(continuity.snapshot),
        };
        if (revealSecretNow) {
          knowledgePatch.secretDiscovered = true;
          recordStoryBeat(req.user!.id, characterId, {
            summary: `Player uncovered ${displayName}'s secret: ${getLore(characterId).secret.label}.`,
            source: 'secret',
          });
        }
        void upsertNpcState(req.user!.id, characterId, { knowledge: knowledgePatch }).catch((e) => console.warn('[chat] perception update failed:', e));
      }

      // Disruption / chaos bookkeeping: mark fired events and persist residue beats.
      if (firedDisruption) {
        void markDisruptionFired(req.user!.id, characterId, firedDisruption.id).catch(() => {});
      }
      if (firedNpcChaosKey) {
        void markNpcChaosFired(req.user!.id, characterId, firedNpcChaosKey).catch(() => {});
      }
      for (const residue of chaosResidues) {
        recordStoryBeat(req.user!.id, characterId, { summary: residue, source: 'disruption' });
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

    // Affinity is driven by the engine (consequencesFor -> applyEffects), plus meet-arc completion bonus.
    let newAffinityScore: number = appliedAffinity ?? affinity;
    if (affinityAwarded > 0) {
      try {
        newAffinityScore = await incrementAffinity(req.user!.id, characterId, affinityAwarded);
      } catch (e) {
        console.warn('[chat] meet affinity award failed:', e);
        affinityAwarded = 0;
      }
    }

    // Autonomous social post: fire-and-forget so arc-completion generation never
    // blocks `done`. When a trigger fired, tell the client to refresh the feed.
    const postTrigger = postTriggerForTurn({
      completedArcId: completedArcIdForPost,
      arcBadgeTitle: earnedBadge?.title ?? null,
      turnText: `${message}\n${assistantFull}`,
      prevAffinity: affinity,
      newAffinity: newAffinityScore,
      emotionalDisclosure: revealSecretNow,
    });
    const posted = postTrigger != null;
    if (postTrigger) {
      void maybeAutonomousPost({
        userId: req.user!.id,
        characterId,
        displayName,
        trigger: postTrigger,
      }).catch((e) => console.warn('[chat] autonomous post failed:', e));
    }

    // Bump usage only for free users so paid users have a clean 0/null state.
    let remaining: number | null = null;
    if (!(await isSubscribed(req.user!.id))) {
      const used = await incrementUsage(req.user!.id);
      remaining = Math.max(0, FREE_TIER_DAILY_LIMIT - used);
    }

    let companionPortraitKey: string | null = null;
    if (characterId.startsWith('user:')) {
      const custom = await getUserCharacter(characterId.slice('user:'.length));
      if (custom?.ownerUserId === req.user!.id) companionPortraitKey = custom.imageKey;
    }

    const presentation = resolvePresentation({
      snapshot: finalSceneSnapshot,
      characterId,
      companionName: displayName,
      emotions,
      companionPortraitKey,
      chaosTone: chaosHint?.tone ?? null,
      venueChanged:
        (finalSceneSnapshot?.venueSlug ?? null) !== venueSlugBefore ||
        (finalSceneSnapshot?.roomId ?? null) !== roomIdBefore,
    });

    const profileForActions = await getFullProfile(req.user!.id).catch(() => null);
    availableActions = resolveAvailableActions({
      snapshot: finalSceneSnapshot,
      progress: playerProgress,
      inventory: profileForActions?.inventory ?? [],
      wornItemIds: profileForActions?.presentation.wornItemIds ?? [],
      companionName: displayName,
      characterId,
      currentVenueSlug: finalSceneSnapshot?.venueSlug ?? null,
    });

    send('done', {
      remaining,
      affinityScore: newAffinityScore,
      affinityAwarded,
      earnedBadge,
      meetArcComplete: earnedBadge && activeArc?.isMeetArc ? true : undefined,
      choices: replyChoices,
      posted,
      chaos: chaosHint,
      presentation,
      availableActions,
    });

    res.end();
  } catch (err) {
    console.error('[chat] stream error:', err);
    send('error', { message: 'stream_failed' });
    res.end();
  }
}

/** Cleans a single-voice plain-text reply: drops code fences, stray [LABEL]
 *  prefixes, and isolated foreign-script (CJK, etc.) token leaks. */
function cleanDialogueReply(raw: string): string {
  const t = (raw ?? '').replace(/\r\n/g, '\n').replace(/```[a-z]*/gi, '').replace(/```/g, '');
  return t
    .split('\n')
    .map((line) => sanitizeEnglishDialogue(line.replace(/^\s*\[[^\]]+\]\s?/, '')))
    .join('\n')
    .trim();
}

// Dialogue-only chat turn. The engine owns the world; the LLM only voices the one
// character the player is talking to (tone, voice style, emotional state). Plain
// text in, plain first-person text out — no scene/story/event/multi-actor content.
async function streamDialogueTurn(req: Request, res: Response) {
  const body = req.body as ChatRequestBody;
  const { characterId, actionId } = body;
  let message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!characterId || (!message && !actionId)) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  if (characterId.startsWith('user:')) {
    const ok = await ensureUserCharacterLoaded(characterId, req.user!.id);
    if (!ok) return res.status(404).json({ error: 'unknown_character' });
  }

  let displayName = characterId;
  try {
    displayName = getCharacter(characterId).displayName;
  } catch {
    /* custom character */
  }

  // Structured engine actions (travel, equip, …) resolve to a player utterance so
  // the existing action UI keeps working; world/scene effects live in the engine.
  if (actionId) {
    const [progress, profile, npcMap] = await Promise.all([
      loadPlayerProgress(req.user!.id, characterId),
      getFullProfile(req.user!.id),
      getNpcStates(req.user!.id, [characterId]),
    ]);
    const prior = readSceneSnapshot((npcMap[characterId]?.knowledge ?? {}) as Record<string, unknown>);
    const resolved = resolvePlayerAction(actionId, {
      snapshot: prior,
      progress,
      inventory: profile.inventory,
      wornItemIds: profile.presentation.wornItemIds ?? [],
      companionName: displayName,
      characterId,
      currentVenueSlug: prior?.venueSlug ?? null,
    });
    if (!resolved) return res.status(400).json({ error: 'invalid_action' });
    message = resolved.message;
  }

  if (!message) return res.status(400).json({ error: 'invalid_request' });
  if (message.length > 4000) return res.status(400).json({ error: 'message_too_long', max: 4000 });

  // Recent window for local coherence; long-term recall is out of scope now.
  const turns: ChatMessage[] = budgetHistory(
    await loadRecentTurns(
      req.user!.id,
      characterId,
      RECENT_TURNS_FOR_PROMPT,
      await resolveFreeRoamWindow(req.user!.id, characterId),
    ),
  );

  // Read-only emotional state so tone tracks how the character feels (decays toward
  // baseline; no intent-driven updates anymore).
  let emotions: EmotionState | null = null;
  let secretDiscovered = false;
  try {
    const npcMap = await getNpcStates(req.user!.id, [characterId]);
    const knowledge = (npcMap[characterId]?.knowledge ?? {}) as Record<string, unknown>;
    secretDiscovered = knowledge.secretDiscovered === true;
    const stored = knowledge.emotions as EmotionState | undefined;
    const updatedAt =
      typeof knowledge.emotionsUpdatedAt === 'string' ? Date.parse(knowledge.emotionsUpdatedAt) : NaN;
    const hours = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 3_600_000) : 0;
    emotions = stored ? decayEmotions(stored, characterId, hours) : initEmotions(characterId);
  } catch {
    emotions = null;
  }

  const prompt = buildDialoguePrompt({
    characterId,
    displayName,
    history: turns,
    userMessage: message,
    emotions,
    secretDiscovered,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  const opts = dialogueCompleteOpts();
  let raw = '';
  let streamedChars = 0;
  try {
    try {
      for await (const delta of streamPrompt(prompt, opts)) {
        if (abortController.signal.aborted) break;
        raw += delta;
        const clean = cleanDialogueReply(raw);
        if (clean.length > streamedChars) {
          send('chunk', { text: clean.slice(streamedChars) });
          streamedChars = clean.length;
        }
      }
    } catch (streamErr) {
      console.warn('[chat] dialogue stream failed; falling back to complete:', streamErr);
      raw = await completePrompt(prompt, opts);
    }
    if (!raw.trim()) raw = await completePrompt(prompt, opts);

    const assistantFull = cleanDialogueReply(raw) || '…';
    if (!abortController.signal.aborted && assistantFull.length > streamedChars) {
      send('chunk', { text: assistantFull.slice(streamedChars) });
    }

    await persistTurn({
      userId: req.user!.id,
      characterId,
      userMessage: message,
      assistantMessage: assistantFull,
    });

    // Quota: bump usage only for free users so paid users keep a clean state.
    let remaining: number | null = null;
    if (!(await isSubscribed(req.user!.id))) {
      const used = await incrementUsage(req.user!.id);
      remaining = Math.max(0, FREE_TIER_DAILY_LIMIT - used);
    }

    send('done', { remaining });
    res.end();
  } catch (err) {
    console.error('[chat] dialogue stream error:', err);
    send('error', { message: 'stream_failed' });
    res.end();
  }
}

router.post('/stream', requireAuth, enforceMessageQuota, streamDialogueTurn);

async function loadRecentTurns(
  userId: string,
  characterId: string,
  limit: number,
  window = { since: null, todayOnly: true } as FreeRoamWindow,
): Promise<ChatMessage[]> {
  const windowClause = freeRoamWindowClause(window, 4);
  // Query DESC + LIMIT to get the N most-recent turns, then reverse for chronological order.
  const { rows } = await pool.query<{ role: 'user' | 'assistant'; content: string }>(
    `SELECT role, content FROM chat_messages
     WHERE user_id = $1 AND character_id = $2 AND pack_session_id IS NULL${windowClause.sql}
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [userId, characterId, limit, ...windowClause.params],
  );
  return rows.reverse();
}

// Full-ish backlog used by /greet to render the conversation when it already exists.
function loadHistory(
  userId: string,
  characterId: string,
  window: FreeRoamWindow,
): Promise<ChatMessage[]> {
  return loadRecentTurns(userId, characterId, 30, window);
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
