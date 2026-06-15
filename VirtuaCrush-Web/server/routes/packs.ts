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
import { getLore, formatCharacterFactsBlock } from '../inworld/lore';
import { formatPersonaTraitsBlock } from '../sim/traits';
import { ROLEPLAY_INPUT_DIRECTIVE, directorDisciplineDirective } from '../db/roleplay_util';
import { incrementAffinity } from '../db/affinity';
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
} from '../db/pack_sessions';

/** Affinity awarded for finishing a story when the pack doesn't specify its own. */
const DEFAULT_AFFINITY_REWARD = 10;

const router = Router();

// ---------------------------------------------------------------------------
// Pack loader (reads JSON files from server/packs/ at runtime)
// ---------------------------------------------------------------------------
const PACKS_DIR = path.join(process.cwd(), 'server', 'packs');

function loadAllPacks(): StoryPack[] {
  try {
    const files = readdirSync(PACKS_DIR).filter((f) => f.endsWith('.json'));
    return files.map((f) => JSON.parse(readFileSync(path.join(PACKS_DIR, f), 'utf8')) as StoryPack);
  } catch {
    return [];
  }
}

function loadPack(id: string): StoryPack | null {
  const all = loadAllPacks();
  return all.find((p) => p.id === id) ?? null;
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
function buildPackDirectorPrompt(pack: StoryPack, node: PackNode, characterId: string): string {
  let character;
  try { character = getCharacter(characterId as Parameters<typeof getCharacter>[0]); }
  catch { return ''; }

  const name = character.displayName ?? characterId;
  const lore = getLore(characterId);
  const sceneBlock = pack.sceneAnchor
    ? `\n\n=== CURRENT SETTING ===\n${pack.sceneAnchor.situation}`
    : '';

  const npcs = pack.npcs ?? [];
  const speakerList = [
    `- "narrator" — ${NARRATOR_BRIEF} Owns ALL action/reaction in the scene (${name}, the NPCs, and the world); wrap actions in *asterisks*; no dialogue.`,
    `- "${name}" — speaks ONLY their own spoken words, first person; no actions or reactions in this line.`,
    ...npcs.map((n) => `- "${n.name}" — ${n.description} Speaks only their own words; their actions are narrated by "narrator".`),
  ].join('\n');

  const authoredChoices = (node.choices && node.choices.length)
    ? node.choices.map((c) => `- "${c.label}" → advance "${c.next}"  (the player choosing this means: ${c.userMessage})`).join('\n')
    : '(this beat has no preset choices)';

  const beatMap = Object.entries(pack.nodes)
    .map(([id, n]) => (n.choices == null ? `- ${id}  (ENDING — concludes the story)` : `- ${id}`))
    .join('\n');

  const npcSpeakerExample = npcs.length ? ` | "${npcs[0]!.name}"` : '';
  const schema =
    `\n\n=== HOW TO REPLY (ONE JSON OBJECT) ===\n` +
    `Reply with ONE JSON object only — no prose, no code fences:\n` +
    `{\n` +
    `  "lines": [ { "speaker": "narrator" | "${name}"${npcSpeakerExample}, "text": "spoken words — or an *action* for the narrator" } ],\n` +
    `  "advance": "stay" | "end" | "<a beat id below>",\n` +
    `  "choices": [ { "label": "short button text", "userMessage": "first-person line/action if the player picks it", "next": "<beat id> | dynamic | end" } ],\n` +
    `  "arcStatus": "ongoing" | "climax" | "completed"\n` +
    `}\n\n` +
    `READ THE PLAYER — they may TAP a choice or TYPE freely. Interpret what they actually did:\n` +
    `- If their input matches one of THIS BEAT'S CHOICES, set "advance" to that choice's target beat.\n` +
    `- If they are continuing within this beat without deciding, set "advance":"stay".\n` +
    `- If their input brings the scene to a natural close, set "advance":"end".\n\n` +
    `CHOICES — keep the authored story intact:\n` +
    `- Leave "choices" EMPTY ([]) to reuse the story's authored buttons for the resulting beat. This is the DEFAULT — do it almost every turn.\n` +
    `- ONLY when the player clearly pulls the scene away from ALL the authored choices, return 2–3 NEW choices that fit the new direction (each "next":"dynamic", or a beat id if it rejoins the story) and steer back toward an ENDING.\n\n` +
    `NARRATION: characters speak ONLY dialogue; "narrator" owns ALL action and reaction. Include at least one "${name}" line whenever ${name} speaks. Respond ONLY in English. Never write the player's words or actions.\n\n` +
    `KEEP IT MOVING toward an ENDING — never loop the same beat. When the scene has resolved, set "advance":"end" and "arcStatus":"completed".\n\n` +
    `SPEAKERS (use the exact name in "speaker"):\n${speakerList}\n\n` +
    `THIS BEAT'S CHOICES (the player's options right now):\n${authoredChoices}\n\n` +
    `STORY BEATS you may advance to:\n${beatMap}`;

  return (
    character.systemPrompt +
    `\n\n=== STORY PACK: ${pack.title} ===\n${pack.systemInstruction}` +
    `\n\n=== CURRENT BEAT ===\n${node.npcInstruction}` +
    sceneBlock +
    formatCharacterFactsBlock(lore) +
    formatPersonaTraitsBlock(lore, { discovered: false, revealNow: false }) +
    ROLEPLAY_INPUT_DIRECTIVE +
    directorDisciplineDirective(name) +
    schema
  );
}

// Conservative cleanup for a streamed pack transcript. Preserves "[TAG]" line
// prefixes and *action* asterisks while removing code fences and any leaked
// JSON-key artifacts a weaker model might emit. Used for the final persisted
// text and the `finalText` sent on the done event (so the bubble renders clean
// even if a stray fragment slipped through mid-stream).
function sanitizePackTranscript(raw: string): string {
  const noFences = (raw ?? '').replace(/```[a-z]*|```/gi, '');
  const lines = noFences
    .split('\n')
    .map((line) =>
      line
        // leaked per-character keys: serena_actions": [ , serena_lines": "
        .replace(/"?[A-Za-z0-9_]+_(?:actions|lines)"?\s*:\s*\[?\s*/gi, '')
        // leaked schema keys: "lines": / "speaker": / "text": / "intent":
        .replace(/"(?:lines|speaker|text|intent|arcStatus)"\s*:\s*"?/gi, '')
        .trimEnd(),
    )
    // drop lines that are now only JSON punctuation / empty quotes
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !/^[{}\[\],"'`]+$/.test(t);
    });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// GET /api/packs?characterId=lexi
// ---------------------------------------------------------------------------
router.get('/', requireAuth, (req: Request, res: Response) => {
  const { characterId } = req.query as { characterId?: string };
  const packs = loadAllPacks();
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
  const pack = loadPack(id);
  if (!pack) return res.status(404).json({ error: 'pack_not_found' });

  try {
    // Guardrail: only one active story per (user, character) at a time.
    // If a story is already in progress, refuse and return it so the client
    // can offer to resume or abandon it.
    const existing = await getActivePackSession(req.user!.id, pack.characterId);
    if (existing) {
      const existingPack = loadPack(existing.packId);
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
    return res.json({
      sessionId: session.id,
      packId: id,
      characterId: pack.characterId,
      currentNode: 'start',
      introNarrative: startNode?.introNarrative ?? null,
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

  const pack = loadPack(session.packId);
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

  const pack = loadPack(session.packId);
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
    introNarrative: startNode?.introNarrative ?? null,
    choices: startNode?.choices ?? null,
    currentNode: 'start',
    pack: packToMeta(pack),
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

  const pack = loadPack(session.packId);
  if (!pack) return res.status(404).json({ error: 'pack_not_found' });

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
  const directorPrompt = buildPackDirectorPrompt(pack, node, session.characterId);
  const turnsStr = history
    .map((m) => (m.role === 'user' ? `Player: ${m.content}` : m.content))
    .join('\n');
  const fullPrompt = `${directorPrompt}\n\n${turnsStr ? turnsStr + '\n' : ''}Player: ${message}\n\nJSON:`;

  let result;
  try {
    const raw = await completePrompt(fullPrompt, { json: true });
    result = parsePackScene(raw, companionName);
  } catch (err) {
    console.error('[packs] turn generation error:', err);
    return res.status(502).json({ error: 'generation_failed' });
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
  if (pack.nodes[nextNode]?.choices == null) completeNow = true;
  if (result.arcStatus === 'completed') completeNow = true;

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
    affinityAwarded = pack.affinityReward ?? DEFAULT_AFFINITY_REWARD;
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

  const pack = loadPack(session.packId);
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
  const stories = sessions.map((s) => {
    const pack = loadPack(s.packId);
    return {
      sessionId: s.sessionId,
      packId: s.packId,
      title: pack?.title ?? 'Story',
      blurb: pack?.blurb ?? null,
      completedAt: s.completedAt,
      lastLine: s.lastLine,
    };
  });
  return res.json({ stories });
});

export default router;
