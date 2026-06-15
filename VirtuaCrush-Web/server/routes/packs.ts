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
import { getCharacter } from '../inworld/characters';
import { getLore, formatCharacterFactsBlock } from '../inworld/lore';
import { formatPersonaTraitsBlock } from '../sim/traits';
import { ROLEPLAY_INPUT_DIRECTIVE } from '../db/roleplay_util';
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
} from '../db/pack_sessions';

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
// Build the system prompt for a pack turn
// ---------------------------------------------------------------------------
function buildPackPrompt(pack: StoryPack, node: PackNode, characterId: string): string {
  let character;
  try { character = getCharacter(characterId as Parameters<typeof getCharacter>[0]); }
  catch { return ''; }

  const lore = getLore(characterId);
  const sceneBlock = pack.sceneAnchor
    ? `\n\n=== CURRENT SETTING ===\n${pack.sceneAnchor.situation}`
    : '';

  return (
    character.systemPrompt +
    `\n\n=== STORY PACK: ${pack.title} ===\n${pack.systemInstruction}` +
    `\n\n=== CURRENT BEAT ===\n${node.npcInstruction}` +
    sceneBlock +
    formatCharacterFactsBlock(lore) +
    formatPersonaTraitsBlock(lore, { discovered: false, revealNow: false }) +
    ROLEPLAY_INPUT_DIRECTIVE
  );
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

  // Build a simple prompt: system + history + new message
  const turns = history
    .map((m) => `${m.role === 'user' ? 'User' : session.characterId}: ${m.content}`)
    .join('\n');
  const fullPrompt = `${systemPrompt}\n\n${turns ? turns + '\n' : ''}User: ${message}\n${session.characterId}:`;

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

    if (fullText && !abortController.signal.aborted) {
      await persistPackTurn(req.user!.id, session.characterId, sessionId, message, fullText);
    }

    // Return choices for the CURRENT node (post-advance)
    const newNode = pack.nodes[currentNode];
    const choices: PackChoice[] | null = newNode?.choices ?? null;

    // Option A: explicit end node
    let sessionCompleted = false;
    if (currentNode === 'end') {
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

    send('done', { choices, currentNode, sessionCompleted });
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

export default router;
