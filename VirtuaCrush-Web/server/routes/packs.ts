// Story pack routes.
//
// GET  /api/packs?characterId=lexi        — list pack metadata for a character
// POST /api/packs/:id/start               — create a pack session
// GET  /api/packs/session/:sid            — get session state + current choices
// GET  /api/packs/session/:sid/greet      — greet (intro + history) for the pack thread
// POST /api/packs/session/:sid/stream     — SSE stream for a pack turn
// POST /api/packs/session/:sid/abandon    — abandon the session

import { Router, type Request, type Response } from 'express';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { requireAuth } from '../middleware/auth';
import { completePrompt } from '../llm';
import { getCharacter, NARRATOR_BRIEF } from '../inworld/characters';
import { turnsToTranscript, parsePackScene } from '../inworld/director';
import { packOpeningIntro } from '../inworld/pack_intro';
import { sanitizeRoleplayTranscript } from '../inworld/transcript_sanitize';
import {
  formatSceneNpcBlock,
  npcsToSpeakerBriefs,
  resolvePackNpcsFromStory,
} from '../inworld/npc_schema';
import { getLore, formatCharacterFactsBlock } from '../inworld/lore';
import { formatPersonaTraitsBlock } from '../sim/traits';
import { ROLEPLAY_INPUT_DIRECTIVE, directorDisciplineDirective } from '../db/roleplay_util';
import { incrementAffinity } from '../db/affinity';
import { getCompletedArcIds } from '../db/arc_state';
import { hasCompletedMeetArc } from '../inworld/meet_arc';
import type { StoryPack, PackMeta, PackNode, PackChoice } from '../inworld/pack_types';
import {
  createPackSession,
  getPackSession,
  getActivePackSession,
  updatePackNode,
  completePackSession,
  abandonPackSession,
  loadPackMessages,
  countPackMessages,
  persistPackTurn,
  getCompletedPackSessions,
  updatePackSceneState,
  updatePackSceneContinuity,
} from '../db/pack_sessions';
import {
  getCharacterStoryBeats,
  formatCharacterStoryBlock,
  recordStoryBeat,
} from '../db/story_memory';
import {
  buildInitialSceneSnapshot,
  formatSceneSnapshotBlock,
  applySceneContinuityUpdate,
} from '../inworld/scene_snapshot';
import { getUserStory, listUserStories } from '../db/user_stories';
import { userStoryToPack } from '../inworld/user_pack';
import { ensureUserCharacterLoaded } from '../db/user_characters';
import {
  buildInitialSceneState,
  formatPersistentSceneDirective,
  formatStoryActDirective,
  resolvePackNodeAct,
  sceneDirectiveFromAnchor,
  validateSceneStateUpdate,
  formatSceneValidationRetryHint,
  repairSceneStateCast,
  requiredCastNames,
} from '../inworld/story_structure';

import { DEFAULT_PACK_AFFINITY_REWARD } from '../progression';

const router = Router();

// ---------------------------------------------------------------------------
// Pack loader (reads JSON files from server/packs/ at runtime)
// ---------------------------------------------------------------------------
const PACKS_DIR = path.join(process.cwd(), 'server', 'packs');

/** Built-in packs shipped as JSON in server/packs/. */
function loadBuiltinPacks(): StoryPack[] {
  try {
    const files = readdirSync(PACKS_DIR).filter((f) => f.endsWith('.json'));
    return files.map((f) => JSON.parse(readFileSync(path.join(PACKS_DIR, f), 'utf8')) as StoryPack);
  } catch {
    return [];
  }
}

/** A user's own CYOA adventures (format='pack'), as runtime StoryPacks. */
async function loadUserPacks(userId: string): Promise<StoryPack[]> {
  try {
    const stories = await listUserStories(userId);
    return stories
      .filter((s) => s.format === 'pack')
      .map(userStoryToPack)
      .filter((p): p is StoryPack => p != null);
  } catch {
    return [];
  }
}

/** All packs visible to a user: built-ins + their own custom adventures. */
async function loadAllPacks(userId?: string): Promise<StoryPack[]> {
  const builtin = loadBuiltinPacks();
  if (!userId) return builtin;
  const user = await loadUserPacks(userId);
  return [...builtin, ...user];
}

/** Resolve a pack by id. `user:<storyId>` packs are loaded from the DB and are
 *  only returned to their owner; built-in ids load from the filesystem. */
async function loadPack(id: string, userId?: string): Promise<StoryPack | null> {
  if (id.startsWith('user:')) {
    const story = await getUserStory(id.slice('user:'.length));
    if (!story || story.format !== 'pack') return null;
    if (userId && story.ownerUserId !== userId) return null;
    return userStoryToPack(story);
  }
  return loadBuiltinPacks().find((p) => p.id === id) ?? null;
}

/** Custom companions must be loaded into the registry before getCharacter()
 *  (used by the director) can resolve them. No-op for built-in characters. */
async function ensurePackCharacter(characterId: string, userId: string): Promise<void> {
  if (characterId.startsWith('user:')) {
    try { await ensureUserCharacterLoaded(characterId, userId); } catch { /* tolerated */ }
  }
}

function packToMeta(p: StoryPack): PackMeta {
  return {
    id: p.id,
    characterId: p.characterId,
    title: p.title,
    blurb: p.blurb,
    tags: p.tags,
    mood: p.mood,
    estimatedMinutes: p.estimatedMinutes,
    coverGradient: p.coverGradient,
  };
}

// ---------------------------------------------------------------------------
// Build the pack DIRECTOR prompt for a turn.
//
// One merged call: the model returns a single JSON object with the multi-actor
// scene (`lines`), a navigation decision (`advance`), optional EVOLVED choice
// buttons (`choices`, used only when the player drifts off the authored
// branches), and an `arcStatus`. This lets free-text input be understood in
// context and advance the story without breaking the offered choices.
//
// Under the strict narrator model, characters emit ONLY spoken dialogue and the
// neutral "narrator" owns every action/reaction; directorDisciplineDirective
// enforces that split. The "speaker" field uses the NAME and is rendered into a
// "[TAG] ..." transcript line by turnsToTranscript (the client already parses
// those into narrator / companion / NPC bubbles).
// ---------------------------------------------------------------------------
function buildPackDirectorPrompt(
  pack: StoryPack,
  node: PackNode,
  nodeId: string,
  characterId: string,
  priorSceneBlock = '',
  storyMemoryBlock = '',
): string {
  let character;
  try { character = getCharacter(characterId as Parameters<typeof getCharacter>[0]); }
  catch { return ''; }

  const name = character.displayName ?? characterId;
  const lore = getLore(characterId);
  const storyAct = resolvePackNodeAct(pack, nodeId);
  const actBlock = formatStoryActDirective(storyAct, 'pack');
  const packNpcsResolved = resolvePackNpcsFromStory(pack);

  const sceneDirective = pack.sceneAnchor
    ? formatPersistentSceneDirective(
        sceneDirectiveFromAnchor(
          pack.sceneAnchor,
          name,
          packNpcsResolved.map((n) => ({
            name: n.name,
            description: `[${n.stance}] ${n.promptBrief}`,
          })),
        ),
      )
    : '';

  const sceneSoFar = priorSceneBlock
    ? priorSceneBlock
    : '';

  const npcBlock = formatSceneNpcBlock(packNpcsResolved);
  const speakerList = [
    `- "narrator" — ${NARRATOR_BRIEF} Owns ALL action/reaction in the scene (${name}, the NPCs, and the world); wrap actions in *asterisks*; no dialogue.`,
    `- "${name}" — speaks ONLY their own spoken words, first person; no actions or reactions in this line.`,
    ...npcsToSpeakerBriefs(packNpcsResolved),
  ].join('\n');

  const authoredChoices = (node.choices && node.choices.length)
    ? node.choices.map((c) => `- "${c.label}" → advance "${c.next}"  (the player choosing this means: ${c.userMessage})`).join('\n')
    : '(this beat has no preset choices)';

  const beatMap = Object.entries(pack.nodes)
    .map(([id, n]) => (n.choices == null ? `- ${id}  (ENDING — concludes the story)` : `- ${id}`))
    .join('\n');

  const npcSpeakerExample = packNpcsResolved.length ? ` | "${packNpcsResolved[0]!.name}"` : '';
  const schema =
    `\n\n=== HOW TO REPLY (ONE JSON OBJECT) ===\n` +
    `Reply with ONE JSON object only — no prose, no code fences:\n` +
    `{\n` +
    `  "lines": [ { "speaker": "narrator" | "${name}"${npcSpeakerExample}, "text": "spoken words — or an *action* for the narrator" } ],\n` +
    `  "advance": "stay" | "end" | "<a beat id below>",\n` +
    `  "choices": [ { "label": "short button text", "userMessage": "first-person line/action if the player picks it", "next": "<beat id> | dynamic | end" } ],\n` +
    `  "sceneState": "<short prose fallback of current scene>",\n` +
    `  "sceneSnapshot": { "location": "...", "present": ["..."], "departed": ["..."], "playerMobility": "free"|"restrained"|"incapacitated", "playerVoice": "free"|"gagged"|"muted", "playerNotes": "...", "companionNotes": "...", "addThreads": ["..."] },\n` +
    `  "memorable": "<a durable one-line beat worth remembering in future sessions, or null>",\n` +
    `  "arcStatus": "ongoing" | "climax" | "completed"\n` +
    `}\n\n` +
    `READ THE PLAYER — they may TAP a choice or TYPE freely. Interpret what they actually did:\n` +
    `- If their input matches one of THIS BEAT'S CHOICES, set "advance" to that choice's target beat.\n` +
    `- If they are continuing within this beat without deciding, set "advance":"stay".\n` +
    `- If their input brings the scene to a natural close, set "advance":"end".\n\n` +
    `CHOICES — keep the authored story intact:\n` +
    `- Leave "choices" EMPTY ([]) to reuse the story's authored buttons for the resulting beat. This is the DEFAULT — do it almost every turn.\n` +
    `- ONLY when the player clearly pulls the scene away from ALL the authored choices, return 2–3 NEW choices that fit the new direction (each "next":"dynamic", or a beat id if it rejoins the story) and steer back toward an ENDING.\n` +
    `- NEW choices must be PLAYER tap-to-send messages (first-person speech or *actions*), never ${name}'s dialogue and never second-person "You …" descriptions.\n\n` +
    `NARRATION: characters speak ONLY dialogue; "narrator" owns ALL action and reaction. Include at least one "${name}" line whenever ${name} speaks. Respond ONLY in English. Never write the player's words or actions.\n\n` +
    `SCENE CONTINUITY: Honor the SCENE DIRECTIVE block and SCENE SNAPSHOT. Always return "sceneSnapshot" with authoritative location, present cast, and player mobility/voice (they persist until explicitly cleared). Also return "sceneState" as short prose. Set "memorable" only for a genuinely durable beat worth recalling in a FUTURE conversation; otherwise null.\n\n` +
    `KEEP IT MOVING toward an ENDING — never loop the same beat. When the scene has resolved, set "advance":"end" and "arcStatus":"completed".\n\n` +
    `SPEAKERS (use the exact name in "speaker"):\n${speakerList}\n\n` +
    `THIS BEAT'S CHOICES (the player's options right now):\n${authoredChoices}\n\n` +
    `STORY BEATS you may advance to:\n${beatMap}`;

  return (
    character.systemPrompt +
    `\n\n=== STORY PACK: ${pack.title} ===\n${pack.systemInstruction}` +
    `\n\n=== CURRENT BEAT ===\n${node.npcInstruction}` +
    actBlock +
    sceneDirective +
    npcBlock +
    sceneSoFar +
    storyMemoryBlock +
    formatCharacterFactsBlock(lore) +
    formatPersonaTraitsBlock(lore, { discovered: false, revealNow: false }) +
    ROLEPLAY_INPUT_DIRECTIVE +
    directorDisciplineDirective(name) +
    schema
  );
}

// Conservative cleanup for a streamed pack transcript. Preserves "[TAG]" line
// prefixes and *action* asterisks while removing code fences and any leaked
// JSON-key artifacts a weaker model might emit.
function sanitizePackTranscript(raw: string): string {
  return sanitizeRoleplayTranscript(raw);
}

// ---------------------------------------------------------------------------
// GET /api/packs?characterId=lexi
// ---------------------------------------------------------------------------
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.query as { characterId?: string };
  const packs = await loadAllPacks(req.user!.id);
  const meta = packs
    .filter((p) => !characterId || p.characterId === characterId)
    .map(packToMeta);
  return res.json({ packs: meta });
});

// ---------------------------------------------------------------------------
// POST /api/packs/:id/start
// ---------------------------------------------------------------------------
router.post('/:id/start', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const pack = await loadPack(id, req.user!.id);
  if (!pack) return res.status(404).json({ error: 'pack_not_found' });

  try {
    const completed = await getCompletedArcIds(req.user!.id, pack.characterId);
    if (!hasCompletedMeetArc(pack.characterId, completed)) {
      return res.status(403).json({
        error: 'meet_arc_required',
        message: 'Finish your first meeting with this character before starting a story pack.',
      });
    }

    // Guardrail: only one active story per (user, character) at a time.
    // If a story is already in progress, refuse and return it so the client
    // can offer to resume or abandon it.
    const existing = await getActivePackSession(req.user!.id, pack.characterId);
    if (existing) {
      const existingPack = await loadPack(existing.packId, req.user!.id);
      const existingNode = existingPack?.nodes[existing.currentNode];
      return res.status(409).json({
        error: 'story_in_progress',
        active: {
          sessionId: existing.id,
          packId: existing.packId,
          characterId: existing.characterId,
          currentNode: existing.currentNode,
          choices: existingNode?.choices ?? null,
          pack: existingPack ? packToMeta(existingPack) : null,
        },
      });
    }

    const session = await createPackSession(req.user!.id, pack.characterId, id);
    const startNode = pack.nodes['start'];

    // Seed rolling scene state from the pack anchor so continuity starts grounded.
    if (pack.sceneAnchor) {
      let companionName = pack.characterId;
      try {
        await ensurePackCharacter(pack.characterId, req.user!.id);
        companionName = getCharacter(pack.characterId as Parameters<typeof getCharacter>[0]).displayName ?? pack.characterId;
      } catch { /* keep id */ }
      const anchorInput = sceneDirectiveFromAnchor(
          pack.sceneAnchor,
          companionName,
          (pack.npcs ?? []).map((n) => ({ name: n.name, description: n.description })),
        );
      const seedSnap = buildInitialSceneSnapshot(anchorInput);
      const seed = buildInitialSceneState(anchorInput);
      try {
        await updatePackSceneContinuity(session.id, seedSnap, seed);
      } catch (e) { console.warn('[packs] scene seed failed:', e); }
    }

    return res.json({
      sessionId: session.id,
      packId: id,
      characterId: pack.characterId,
      currentNode: 'start',
      introNarrative: packOpeningIntro(pack, startNode),
      choices: startNode?.choices ?? null,
    });
  } catch (err) {
    console.error('[packs] start error:', err);
    return res.status(500).json({ error: 'start_failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/packs/session/:sid
// ---------------------------------------------------------------------------
router.get('/session/:sid', requireAuth, async (req: Request, res: Response) => {
  const sessionId = Number(req.params.sid);
  if (!Number.isFinite(sessionId)) return res.status(400).json({ error: 'invalid_session' });

  const session = await getPackSession(sessionId);
  if (!session || session.userId !== req.user!.id) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  const pack = await loadPack(session.packId, req.user!.id);
  const node = pack?.nodes[session.currentNode] ?? null;
  const choices: PackChoice[] | null = node?.choices ?? null;

  return res.json({
    sessionId: session.id,
    packId: session.packId,
    characterId: session.characterId,
    currentNode: session.currentNode,
    status: session.status,
    choices,
    pack: pack ? packToMeta(pack) : null,
  });
});

// ---------------------------------------------------------------------------
// GET /api/packs/session/:sid/greet
// Returns history (if exists) or the intro narrative for the pack thread.
// ---------------------------------------------------------------------------
router.get('/session/:sid/greet', requireAuth, async (req: Request, res: Response) => {
  const sessionId = Number(req.params.sid);
  if (!Number.isFinite(sessionId)) return res.status(400).json({ error: 'invalid_session' });

  const session = await getPackSession(sessionId);
  if (!session || session.userId !== req.user!.id) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  const pack = await loadPack(session.packId, req.user!.id);
  if (!pack) return res.status(404).json({ error: 'pack_not_found' });

  const history = await loadPackMessages(sessionId, 30);
  const node = pack.nodes[session.currentNode];
  const choices: PackChoice[] | null = node?.choices ?? null;

  if (history.length > 0) {
    return res.json({
      hasHistory: true,
      history,
      choices,
      currentNode: session.currentNode,
      pack: packToMeta(pack),
    });
  }

  // First visit — return intro for the start node
  const startNode = pack.nodes['start'];
  return res.json({
    hasHistory: false,
    introNarrative: packOpeningIntro(pack, startNode),
    choices: startNode?.choices ?? null,
    currentNode: 'start',
    pack: packToMeta(pack),
  });
});

// ---------------------------------------------------------------------------
// GET /api/packs/session/:sid/transcript
// Full message transcript for a session (used to READ a completed story).
// ---------------------------------------------------------------------------
router.get('/session/:sid/transcript', requireAuth, async (req: Request, res: Response) => {
  const sessionId = Number(req.params.sid);
  if (!Number.isFinite(sessionId)) return res.status(400).json({ error: 'invalid_session' });

  const session = await getPackSession(sessionId);
  if (!session || session.userId !== req.user!.id) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  const pack = await loadPack(session.packId, req.user!.id);
  const messages = await loadPackMessages(sessionId, 1000);
  return res.json({
    messages,
    title: pack?.title ?? 'Story',
    packId: session.packId,
    status: session.status,
  });
});

// ---------------------------------------------------------------------------
// POST /api/packs/session/:sid/turn
// Body: { message: string, advanceNode?: string }
// Returns (JSON): { transcript, choices, currentNode, sessionCompleted,
//                   affinityAwarded, affinity }
//
// One merged director call per turn: it narrates the scene AND decides how the
// story advances from the player's input (a tapped choice OR free text), and
// may evolve the choice buttons when the player drifts off the authored path.
// ---------------------------------------------------------------------------
router.post('/session/:sid/turn', requireAuth, async (req: Request, res: Response) => {
  const sessionId = Number(req.params.sid);
  if (!Number.isFinite(sessionId)) return res.status(400).json({ error: 'invalid_session' });

  const { message, advanceNode } = req.body as { message: string; advanceNode?: string };
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const session = await getPackSession(sessionId);
  if (!session || session.userId !== req.user!.id) {
    return res.status(404).json({ error: 'session_not_found' });
  }
  if (session.status !== 'active') {
    return res.status(400).json({ error: 'session_not_active' });
  }

  const pack = await loadPack(session.packId, req.user!.id);
  if (!pack) return res.status(404).json({ error: 'pack_not_found' });
  // Custom companions must be registered before the director resolves them.
  await ensurePackCharacter(session.characterId, req.user!.id);

  // A tapped AUTHORED choice (advanceNode is a real beat id) advances
  // deterministically. Free text — or a "dynamic" choice whose next isn't an
  // authored beat — stays on the current beat and lets the director interpret it.
  const explicitAdvance = !!(advanceNode && pack.nodes[advanceNode]);
  let currentNode = session.currentNode;
  if (explicitAdvance) {
    currentNode = advanceNode!;
    await updatePackNode(sessionId, currentNode);
  }

  const node = pack.nodes[currentNode];
  if (!node) return res.status(400).json({ error: 'invalid_node' });

  let companionName = session.characterId;
  try { companionName = getCharacter(session.characterId as Parameters<typeof getCharacter>[0]).displayName ?? session.characterId; }
  catch { /* keep id */ }

  const history = await loadPackMessages(sessionId, 30);
  const storyBeats = await getCharacterStoryBeats(req.user!.id, session.characterId);
  const sceneValidationInput = pack.sceneAnchor
    ? sceneDirectiveFromAnchor(
        pack.sceneAnchor,
        companionName,
        (pack.npcs ?? []).map((n) => ({ name: n.name, description: n.description })),
      )
    : null;
  let priorSnapshot = session.sceneSnapshot;
  let sceneSnapshotSeed = null;
  if (sceneValidationInput && !priorSnapshot) {
    sceneSnapshotSeed = buildInitialSceneSnapshot(sceneValidationInput);
    priorSnapshot = sceneSnapshotSeed;
  }
  const priorSceneBlock = priorSnapshot
    ? formatSceneSnapshotBlock(priorSnapshot)
    : session.sceneState
      ? `\n\n=== SCENE SO FAR (authoritative continuity — honor this; it persists beyond the recent messages) ===\n${session.sceneState}`
      : '';
  const priorSceneState = priorSceneBlock;
  const directorPrompt = buildPackDirectorPrompt(
    pack,
    node,
    currentNode,
    session.characterId,
    priorSceneBlock,
    formatCharacterStoryBlock(companionName, storyBeats),
  );
  const turnsStr = history
    .map((m) => (m.role === 'user' ? `Player: ${m.content}` : m.content))
    .join('\n');
  const fullPrompt = `${directorPrompt}\n\n${turnsStr ? turnsStr + '\n' : ''}Player: ${message}\n\nJSON:`;

  let result;
  let continuity = applySceneContinuityUpdate({
    priorSnapshot,
    sceneSnapshotPatch: null,
    sceneStateProse: session.sceneState,
    narratorTexts: [],
    requiredNames: sceneValidationInput ? requiredCastNames(sceneValidationInput) : [],
    seedSnapshot: sceneSnapshotSeed,
  });
  try {
    const raw = await completePrompt(fullPrompt, { json: true });
    result = parsePackScene(raw, companionName);

    const narratorTextsForScene = result.turns
      .filter((t) => t.speaker.toLowerCase() === 'narrator')
      .map((t) => t.text);
    continuity = applySceneContinuityUpdate({
      priorSnapshot,
      sceneSnapshotPatch: result.sceneSnapshotPatch,
      sceneStateProse: result.sceneState,
      narratorTexts: narratorTextsForScene,
      requiredNames: sceneValidationInput ? requiredCastNames(sceneValidationInput) : [],
      seedSnapshot: sceneSnapshotSeed,
    });
    result.sceneState = continuity.sceneState;

    if (sceneValidationInput && result.sceneState) {
      const narratorTexts = narratorTextsForScene;
      let check = validateSceneStateUpdate({
        priorSceneState,
        nextSceneState: result.sceneState,
        requiredNames: requiredCastNames(sceneValidationInput),
        narratorTexts,
      });
      if (!check.ok) {
        const rawFix = await completePrompt(fullPrompt + formatSceneValidationRetryHint(check), { json: true });
        result = parsePackScene(rawFix, companionName);
        const fixNarrator = result.turns
          .filter((t) => t.speaker.toLowerCase() === 'narrator')
          .map((t) => t.text);
        continuity = applySceneContinuityUpdate({
          priorSnapshot,
          sceneSnapshotPatch: result.sceneSnapshotPatch,
          sceneStateProse: result.sceneState,
          narratorTexts: fixNarrator,
          requiredNames: requiredCastNames(sceneValidationInput),
          seedSnapshot: sceneSnapshotSeed,
        });
        result.sceneState = continuity.sceneState;
        check = validateSceneStateUpdate({
          priorSceneState,
          nextSceneState: result.sceneState,
          requiredNames: requiredCastNames(sceneValidationInput),
          narratorTexts: fixNarrator,
        });
        if (!check.ok && check.droppedCharacters?.length) {
          result.sceneState = repairSceneStateCast(
            result.sceneState,
            check.droppedCharacters,
            priorSceneState,
          );
        }
      }
    }
  } catch (err) {
    console.error('[packs] turn generation error:', err);
    return res.status(502).json({ error: 'generation_failed' });
  }

  // Persist rolling scene continuity + any durable story beat.
  try {
    await updatePackSceneContinuity(sessionId, continuity.snapshot, continuity.sceneState);
  } catch (e) { console.warn('[packs] scene state persist failed:', e); }
  if (result.memorable) {
    recordStoryBeat(req.user!.id, session.characterId, { summary: result.memorable, source: 'memorable' });
  }

  // Resolve where the story goes next.
  //  - explicit authored choice → already advanced above.
  //  - free text → honor the director's "advance" (a beat id moves there;
  //    'end' completes; 'stay'/'dynamic'/unknown stays put).
  let nextNode = currentNode;
  let completeNow = false;
  if (!explicitAdvance) {
    const adv = result.advance;
    if (adv === 'end') completeNow = true;
    else if (adv && adv !== 'stay' && adv !== 'dynamic' && pack.nodes[adv]) nextNode = adv;
  }
  if (nextNode !== currentNode) await updatePackNode(sessionId, nextNode);

  // Landing on a terminal beat, an explicit 'end', or a 'completed' arc finishes it.
  // Guard: require at least one full exchange before the director can end a multi-beat graph early.
  const userTurnCount = history.filter((m) => m.role === 'user').length + 1;
  const minTurnsBeforeEnd = pack.nodes['middle'] ? 2 : 1;
  if (pack.nodes[nextNode]?.choices == null && userTurnCount >= minTurnsBeforeEnd) completeNow = true;
  if (result.arcStatus === 'completed' && userTurnCount >= minTurnsBeforeEnd) completeNow = true;

  const transcript = sanitizePackTranscript(turnsToTranscript(result.turns)) || '[NARRATOR] *A quiet beat passes.*';

  // Choices to present next: authored by default; evolve ONLY on real drift
  // (the director returned its own choices and the player wasn't on a tapped
  // authored choice). Cleared when the story is ending.
  let choices: PackChoice[] | null;
  if (completeNow) {
    choices = null;
  } else if (!explicitAdvance && result.choices.length > 0) {
    choices = result.choices.slice(0, 3).map((c, i) => ({
      id: `dyn_${i}`,
      label: c.label,
      userMessage: c.userMessage,
      next: c.next || 'dynamic',
    }));
  } else {
    choices = pack.nodes[nextNode]?.choices ?? null;
  }

  // Persist the player's turn + the companion's narrated transcript.
  if (transcript) {
    try { await persistPackTurn(req.user!.id, session.characterId, sessionId, message, transcript); }
    catch (e) { console.error('[packs] persist failed:', e); }
  }

  // Completion + turn-limit backstop.
  let sessionCompleted = false;
  if (completeNow) {
    await completePackSession(sessionId);
    sessionCompleted = true;
  } else {
    const maxTurns = pack.maxTurns ?? 40;
    const totalMessages = await countPackMessages(sessionId);
    if (totalMessages >= maxTurns) {
      await completePackSession(sessionId);
      sessionCompleted = true;
    }
  }

  // One-time affinity reward on completion (can't double-pay: a later turn on a
  // completed session is rejected with session_not_active above).
  let affinityAwarded = 0;
  let affinity: number | undefined;
  if (sessionCompleted) {
    choices = null;
    affinityAwarded = pack.affinityReward ?? DEFAULT_PACK_AFFINITY_REWARD;
    try {
      affinity = await incrementAffinity(req.user!.id, session.characterId, affinityAwarded);
    } catch (e) {
      console.error('[packs] affinity award failed:', e);
      affinityAwarded = 0;
    }
  }

  return res.json({ transcript, choices, currentNode: nextNode, sessionCompleted, affinityAwarded, affinity });
});

// ---------------------------------------------------------------------------
// POST /api/packs/session/:sid/abandon
// ---------------------------------------------------------------------------
router.post('/session/:sid/abandon', requireAuth, async (req: Request, res: Response) => {
  const sessionId = Number(req.params.sid);
  if (!Number.isFinite(sessionId)) return res.status(400).json({ error: 'invalid_session' });

  const session = await getPackSession(sessionId);
  if (!session || session.userId !== req.user!.id) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  await abandonPackSession(sessionId);
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/packs/active?characterId=lexi   — get active session for the character
// ---------------------------------------------------------------------------
router.get('/active', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.query as { characterId?: string };
  if (!characterId) return res.status(400).json({ error: 'missing_character_id' });

  const session = await getActivePackSession(req.user!.id, characterId);
  if (!session) return res.json({ session: null });

  const pack = await loadPack(session.packId, req.user!.id);
  const node = pack?.nodes[session.currentNode];
  return res.json({
    session: {
      sessionId: session.id,
      packId: session.packId,
      currentNode: session.currentNode,
      choices: node?.choices ?? null,
      pack: pack ? packToMeta(pack) : null,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/packs/history?characterId=lexi  — completed stories for the history panel
// ---------------------------------------------------------------------------
router.get('/history', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.query as { characterId?: string };
  if (!characterId) return res.status(400).json({ error: 'missing_character_id' });

  const sessions = await getCompletedPackSessions(req.user!.id, characterId);
  const stories = await Promise.all(sessions.map(async (s) => {
    const pack = await loadPack(s.packId, req.user!.id);
    return {
      sessionId: s.sessionId,
      packId: s.packId,
      title: pack?.title ?? 'Story',
      blurb: pack?.blurb ?? null,
      completedAt: s.completedAt,
      lastLine: s.lastLine,
    };
  }));
  return res.json({ stories });
});

export default router;
