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
import { streamPrompt } from '../llm';
import { getCharacter, NARRATOR_BRIEF } from '../inworld/characters';
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
// Build the system prompt for a pack turn.
//
// Pack turns are streamed (for the live "typing" effect), so unlike the
// free-roam director we cannot post-process a JSON object server-side. Instead
// we ask the model to stream the SAME tagged multi-actor transcript the client
// already parses ("[NARRATOR] ...", "[SERENA] ...", "[URIK] ..."). Under the
// strict narrator model, characters emit ONLY spoken dialogue and the neutral
// [NARRATOR] owns every action/reaction/scene beat. directorDisciplineDirective
// enforces that split and bars raw-JSON leaks and language drift.
// ---------------------------------------------------------------------------
function companionTag(name: string): string {
  return (name || 'YOU').trim();
}

function buildPackPrompt(pack: StoryPack, node: PackNode, characterId: string): string {
  let character;
  try { character = getCharacter(characterId as Parameters<typeof getCharacter>[0]); }
  catch { return ''; }

  const name = character.displayName ?? characterId;
  const tag = companionTag(name);
  const lore = getLore(characterId);
  const sceneBlock = pack.sceneAnchor
    ? `\n\n=== CURRENT SETTING ===\n${pack.sceneAnchor.situation}`
    : '';

  const npcs = pack.npcs ?? [];
  const speakerList = [
    `- [NARRATOR] — ${NARRATOR_BRIEF} It handles ALL action and reaction in this beat — what ${name}, the NPCs, and the world physically do. Wrap actions in *asterisks*. No dialogue.`,
    `- [${tag}] — ${name}, speaking ONLY their own spoken words in the first person. NEVER put actions, gestures, expressions, or reactions in this line — those go to [NARRATOR].`,
    ...npcs.map((n) => `- [${n.name}] — ${n.description} Speaks ONLY their own words; their actions and reactions are narrated by [NARRATOR].`),
  ].join('\n');

  const replyFormat =
    `\n\n=== HOW TO REPLY ===\n` +
    `Write this beat as a short screenplay transcript — NOT as JSON. Every line begins with a speaker ` +
    `tag in square brackets, then that speaker's spoken words (character lines) or *action* (narrator line). ` +
    `Use these tags EXACTLY:\n` +
    `${speakerList}\n` +
    `Rules: CHARACTERS NEVER NARRATE. A [${tag}] (or NPC) line is pure spoken dialogue; every physical action, ` +
    `reaction, expression, and scene beat goes in a [NARRATOR] line. If ${name} both speaks and moves, emit a ` +
    `[${tag}] line for the words AND a [NARRATOR] line for the action. Always include at least one [${tag}] line ` +
    `when ${name} speaks; a wordless reaction is a [NARRATOR] line alone. Never voice the player. ` +
    (npcs.length
      ? `When an NPC speaks, give them their own [${npcs[0]!.name}]-style line (dialogue only) and narrate their actions in [NARRATOR] so the tension is on the page. `
      : ``) +
    `Address the player as "you". Respond ONLY in English. Keep it to a few lines. ` +
    `Do NOT output JSON, key names, or code fences — only tagged transcript lines.`;

  return (
    character.systemPrompt +
    `\n\n=== STORY PACK: ${pack.title} ===\n${pack.systemInstruction}` +
    `\n\n=== CURRENT BEAT ===\n${node.npcInstruction}` +
    sceneBlock +
    formatCharacterFactsBlock(lore) +
    formatPersonaTraitsBlock(lore, { discovered: false, revealNow: false }) +
    ROLEPLAY_INPUT_DIRECTIVE +
    directorDisciplineDirective(name) +
    replyFormat
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
// POST /api/packs/session/:sid/stream
// Body: { message: string, advanceNode?: string }
// SSE: event: chunk { text }, event: done { choices, currentNode }, event: error
// ---------------------------------------------------------------------------
router.post('/session/:sid/stream', requireAuth, async (req: Request, res: Response) => {
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

  // Advance the node if the player picked a choice
  let currentNode = session.currentNode;
  if (advanceNode && pack.nodes[advanceNode]) {
    currentNode = advanceNode;
    await updatePackNode(sessionId, currentNode);
  }

  const node = pack.nodes[currentNode];
  if (!node) return res.status(400).json({ error: 'invalid_node' });

  const history = await loadPackMessages(sessionId, 30);
  const systemPrompt = buildPackPrompt(pack, node, session.characterId);

  // History: the player's turns are prefixed "Player:"; the companion's stored
  // turns are already tagged transcripts ("[SERENA] ..."), so they're passed
  // through verbatim. We end on "Player: <message>" and let the model produce
  // the next tagged lines (no trailing companion label, which would otherwise
  // bias it toward a single untagged blob).
  const turns = history
    .map((m) => (m.role === 'user' ? `Player: ${m.content}` : m.content))
    .join('\n');
  const fullPrompt = `${systemPrompt}\n\n${turns ? turns + '\n' : ''}Player: ${message}\n`;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let fullText = '';
  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    for await (const chunk of streamPrompt(fullPrompt)) {
      if (abortController.signal.aborted) break;
      if (chunk) {
        fullText += chunk;
        send('chunk', { text: chunk });
      }
    }

    // Clean any leaked JSON artifacts before persisting / sending the final
    // text (live chunks may contain a stray fragment from a weaker model).
    const cleanText = sanitizePackTranscript(fullText);

    if (cleanText && !abortController.signal.aborted) {
      await persistPackTurn(req.user!.id, session.characterId, sessionId, message, cleanText);
    }

    // Return choices for the CURRENT node (post-advance)
    const newNode = pack.nodes[currentNode];
    const choices: PackChoice[] | null = newNode?.choices ?? null;

    // Terminal nodes have no choices (choices === null). The session completes
    // when the player reaches ANY terminal node — they are named per pack
    // (e.g. "confess_end", "stay_end"), so we detect by shape, not a fixed id.
    let sessionCompleted = false;
    const isTerminal = !newNode || newNode.choices == null;
    if (isTerminal) {
      await completePackSession(sessionId);
      sessionCompleted = true;
    }

    // Option C: turn-limit fallback — auto-complete after maxTurns messages
    if (!sessionCompleted) {
      const maxTurns = pack.maxTurns ?? 40;
      const totalMessages = await countPackMessages(sessionId);
      if (totalMessages >= maxTurns) {
        await completePackSession(sessionId);
        sessionCompleted = true;
      }
    }

    // Reward: finishing a story grants a one-time affinity bonus. This runs only
    // on the turn that flips the session to 'completed' (a later stream on the
    // same session is rejected with session_not_active), so it can't double-pay.
    let affinityAwarded = 0;
    let affinity: number | undefined;
    if (sessionCompleted) {
      affinityAwarded = pack.affinityReward ?? DEFAULT_AFFINITY_REWARD;
      try {
        affinity = await incrementAffinity(req.user!.id, session.characterId, affinityAwarded);
      } catch (e) {
        console.error('[packs] affinity award failed:', e);
        affinityAwarded = 0; // don't claim a reward the bar didn't actually get
      }
    }

    // finalText lets the client replace the streamed bubble with the cleaned
    // transcript, so a mid-stream artifact never lingers on screen.
    send('done', { choices, currentNode, sessionCompleted, finalText: cleanText, affinityAwarded, affinity });
    res.end();
  } catch (err) {
    console.error('[packs] stream error:', err);
    send('error', { message: 'stream_failed' });
    res.end();
  }
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
