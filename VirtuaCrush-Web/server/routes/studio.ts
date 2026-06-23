// Story Studio routes — user-authored content, private to the creator.
//
// Arcs (Phase 1): freeform story arcs for existing/custom characters.
// Characters (Phase 2): custom companions.
// Adventures (Phase 3): branching CYOA story packs (format='pack'), which
//   surface in the in-chat story list and are played by the pack director.
//
// POST   /api/studio/stories            — create an arc
// GET    /api/studio/stories?characterId — list my stories (optionally per character)
// GET    /api/studio/stories/:id        — get one (owner only)
// PUT    /api/studio/stories/:id        — update an arc (owner only)
// DELETE /api/studio/stories/:id        — delete (owner only)
// POST   /api/studio/stories/:id/play   — activate this arc for the chat with its character
// POST   /api/studio/stories/:id/stop   — clear the active arc
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createUserStory, listUserStories, getUserStory, updateUserStory, deleteUserStory,
  setStoryVisibility, type UserStory,
} from '../db/user_stories';
import {
  createUserCharacter, listUserCharacters, deleteUserCharacter, getUserCharacter,
  ensureUserCharacterLoaded, setCharacterVisibility, type UserCharacter,
} from '../db/user_characters';
import { validateArcSpec } from '../inworld/user_arc';
import { validatePackSpec } from '../inworld/user_pack';
import { setArcActive, clearArc, getCompletedArcIds } from '../db/arc_state';
import { hasCompletedMeetArc } from '../inworld/meet_arc';
import { getSituation, resetSceneComposition } from '../db/state';
import { pool } from '../db/pool';
import { arcOpeningLine } from '../inworld/active_arc';
import { userStoryToArc } from '../inworld/user_arc';
import { getCharacter } from '../inworld/characters';
import { moderateText } from '../inworld/moderation';
import { studioVocabularyPayload, normalizeVoiceTagsInput } from '../studio/schema';
import {
  randomCharacterDraft,
  randomArcDraft,
  randomPackDraft,
  pickRandomCharacterId,
} from '../studio/random';

const router = Router();

/** True if `characterId` is a valid target for studio content owned by `userId`:
 *  a built-in id present in the registry, or a "user:" custom character owned by
 *  the requester (loaded so getCharacter() can later resolve it). */
async function resolveStudioCharacter(characterId: string, userId: string): Promise<boolean> {
  if (characterId.startsWith('user:')) {
    return ensureUserCharacterLoaded(characterId, userId);
  }
  try { getCharacter(characterId as Parameters<typeof getCharacter>[0]); return true; }
  catch { return false; }
}

/** A friendly creator name for attribution. */
function creatorName(req: Request): string {
  return req.user!.name?.trim() || req.user!.email.split('@')[0] || 'A creator';
}

/** Flattens a character's author text for the moderation check. */
function characterText(c: UserCharacter): string {
  return [c.displayName, c.tone, c.core, c.greeting, c.secret].filter(Boolean).join('\n');
}

/** Flattens a story (arc or pack) spec into author text for moderation. */
function storyText(s: UserStory): string {
  const parts: string[] = [s.title, s.blurb];
  const spec = s.spec as Record<string, unknown>;
  for (const k of ['setting', 'situation', 'playerSituation', 'npcInstruction', 'introNarrative', 'completionCriteria', 'systemInstruction']) {
    if (typeof spec[k] === 'string') parts.push(spec[k] as string);
  }
  const nodes = spec.nodes as Record<string, { npcInstruction?: string; introNarrative?: string; choices?: { label?: string; userMessage?: string }[] | null }> | undefined;
  if (nodes) {
    for (const n of Object.values(nodes)) {
      if (n.npcInstruction) parts.push(n.npcInstruction);
      if (n.introNarrative) parts.push(n.introNarrative);
      for (const c of n.choices ?? []) parts.push(`${c.label ?? ''} ${c.userMessage ?? ''}`);
    }
  }
  return parts.filter(Boolean).join('\n');
}

// ===========================================================================
// Custom characters (Phase 2) — private to the creator.
// ===========================================================================

// POST /api/studio/characters { displayName, core, greeting?, secret?, tone? }
router.post('/characters', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const displayName = String(b.displayName ?? '').trim();
  const core = String(b.core ?? '').trim();
  if (!displayName) return res.status(400).json({ error: 'missing_name' });
  if (core.length < 20) return res.status(400).json({ error: 'persona_too_short' });
  try {
    const character = await createUserCharacter({
      ownerUserId: req.user!.id,
      displayName,
      core,
      greeting: typeof b.greeting === 'string' ? b.greeting : '',
      secret: typeof b.secret === 'string' && b.secret.trim() ? b.secret.trim() : null,
      tone: normalizeVoiceTagsInput(b.tone),
    });
    return res.json({ character });
  } catch (err) {
    console.error('[studio] character create failed:', err);
    return res.status(500).json({ error: 'create_failed' });
  }
});

// GET /api/studio/characters — my custom characters
router.get('/characters', requireAuth, async (req: Request, res: Response) => {
  try {
    const characters = await listUserCharacters(req.user!.id);
    return res.json({ characters });
  } catch (err) {
    console.error('[studio] character list failed:', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

// GET /api/studio/characters/:id — one custom character (owner only)
router.get('/characters/:id', requireAuth, async (req: Request, res: Response) => {
  const character = await getUserCharacter(req.params.id);
  if (!character || character.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  return res.json({ character });
});

// DELETE /api/studio/characters/:id
router.delete('/characters/:id', requireAuth, async (req: Request, res: Response) => {
  const ok = await deleteUserCharacter(req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  return res.json({ ok: true });
});

// POST /api/studio/characters/:id/publish — run moderation, go public if it passes
router.post('/characters/:id/publish', requireAuth, async (req: Request, res: Response) => {
  const c = await getUserCharacter(req.params.id);
  if (!c || c.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });

  const verdict = await moderateText(characterText(c));

  const updated = verdict.allow
    ? await setCharacterVisibility(req.user!.id, c.id, { visibility: 'public', moderationStatus: 'approved', reason: null, creatorName: creatorName(req) })
    : await setCharacterVisibility(req.user!.id, c.id, { visibility: 'private', moderationStatus: 'rejected', reason: verdict.reason });
  return res.json({ character: updated, allowed: verdict.allow, reason: verdict.reason });
});

// POST /api/studio/characters/:id/unpublish — make private again
router.post('/characters/:id/unpublish', requireAuth, async (req: Request, res: Response) => {
  const c = await getUserCharacter(req.params.id);
  if (!c || c.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const updated = await setCharacterVisibility(req.user!.id, c.id, { visibility: 'private', moderationStatus: 'approved', reason: null });
  return res.json({ character: updated });
});

// --- Shared publish/unpublish for stories (arcs) AND packs (adventures) -----
async function handleStoryPublish(req: Request, res: Response) {
  const s = await getUserStory(req.params.id);
  if (!s || s.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });

  const verdict = await moderateText(storyText(s));
  const updated = verdict.allow
    ? await setStoryVisibility(req.user!.id, s.id, { visibility: 'public', moderationStatus: 'approved', reason: null, creatorName: creatorName(req) })
    : await setStoryVisibility(req.user!.id, s.id, { visibility: 'private', moderationStatus: 'rejected', reason: verdict.reason });
  return res.json({ story: updated, pack: updated, allowed: verdict.allow, reason: verdict.reason });
}
async function handleStoryUnpublish(req: Request, res: Response) {
  const s = await getUserStory(req.params.id);
  if (!s || s.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const updated = await setStoryVisibility(req.user!.id, s.id, { visibility: 'private', moderationStatus: 'approved', reason: null });
  return res.json({ story: updated, pack: updated });
}
router.post('/stories/:id/publish', requireAuth, handleStoryPublish);
router.post('/stories/:id/unpublish', requireAuth, handleStoryUnpublish);
router.post('/packs/:id/publish', requireAuth, handleStoryPublish);
router.post('/packs/:id/unpublish', requireAuth, handleStoryUnpublish);

// ===========================================================================
// Custom CYOA adventures (Phase 3) — branching story packs, private to creator.
// Stored in user_stories with format='pack'. They surface in the in-chat story
// list (GET /api/packs) and are played by the existing pack director.
// ===========================================================================

// POST /api/studio/packs { characterId, title, blurb?, mood?, setting?, situation, coPresent?, systemInstruction, nodes }
router.post('/packs', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const characterId = String(b.characterId ?? '');
  if (!characterId) return res.status(400).json({ error: 'missing_character' });
  if (!(await resolveStudioCharacter(characterId, req.user!.id))) {
    return res.status(400).json({ error: 'unknown_character' });
  }

  const v = validatePackSpec(b);
  if (!v.ok || !v.spec) return res.status(400).json({ error: 'invalid_spec', detail: v.error });

  try {
    const story = await createUserStory({
      ownerUserId: req.user!.id,
      characterId,
      title: v.spec.title,
      blurb: v.spec.blurb,
      format: 'pack',
      spec: v.spec as unknown as Record<string, unknown>,
    });
    return res.json({ pack: story });
  } catch (err) {
    console.error('[studio] pack create failed:', err);
    return res.status(500).json({ error: 'create_failed' });
  }
});

// GET /api/studio/packs?characterId — my adventures (optionally per character)
router.get('/packs', requireAuth, async (req: Request, res: Response) => {
  const characterId = req.query.characterId ? String(req.query.characterId) : undefined;
  try {
    const all = await listUserStories(req.user!.id, characterId);
    return res.json({ packs: all.filter((s) => s.format === 'pack') });
  } catch (err) {
    console.error('[studio] pack list failed:', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

// GET /api/studio/packs/:id — one adventure (owner only)
router.get('/packs/:id', requireAuth, async (req: Request, res: Response) => {
  const story = await getUserStory(req.params.id);
  if (!story || story.ownerUserId !== req.user!.id || story.format !== 'pack') {
    return res.status(404).json({ error: 'not_found' });
  }
  return res.json({ pack: story });
});

// PUT /api/studio/packs/:id — update an adventure (owner only)
router.put('/packs/:id', requireAuth, async (req: Request, res: Response) => {
  const existing = await getUserStory(req.params.id);
  if (!existing || existing.ownerUserId !== req.user!.id || existing.format !== 'pack') {
    return res.status(404).json({ error: 'not_found' });
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const characterId = String(b.characterId ?? existing.characterId);
  if (!characterId) return res.status(400).json({ error: 'missing_character' });
  if (!(await resolveStudioCharacter(characterId, req.user!.id))) {
    return res.status(400).json({ error: 'unknown_character' });
  }

  const v = validatePackSpec(b);
  if (!v.ok || !v.spec) return res.status(400).json({ error: 'invalid_spec', detail: v.error });

  try {
    const pack = await updateUserStory(req.user!.id, existing.id, {
      characterId,
      title: v.spec.title,
      blurb: v.spec.blurb,
      spec: v.spec as unknown as Record<string, unknown>,
    });
    if (!pack) return res.status(404).json({ error: 'not_found' });
    return res.json({ pack });
  } catch (err) {
    console.error('[studio] pack update failed:', err);
    return res.status(500).json({ error: 'update_failed' });
  }
});

// PUT    /api/studio/packs/:id — update an adventure (owner only)
// DELETE /api/studio/packs/:id
router.delete('/packs/:id', requireAuth, async (req: Request, res: Response) => {
  const story = await getUserStory(req.params.id);
  if (!story || story.ownerUserId !== req.user!.id || story.format !== 'pack') {
    return res.status(404).json({ error: 'not_found' });
  }
  const ok = await deleteUserStory(req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  return res.json({ ok: true });
});

// --- Create (arc) ----------------------------------------------------------
router.post('/stories', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const characterId = String(b.characterId ?? '');
  const format = String(b.format ?? 'arc');

  if (!characterId) return res.status(400).json({ error: 'missing_character' });
  if (!(await resolveStudioCharacter(characterId, req.user!.id))) {
    return res.status(400).json({ error: 'unknown_character' });
  }
  if (format !== 'arc') return res.status(400).json({ error: 'unsupported_format' });

  const v = validateArcSpec(b);
  if (!v.ok || !v.spec) return res.status(400).json({ error: 'invalid_spec', detail: v.error });

  try {
    const story = await createUserStory({
      ownerUserId: req.user!.id,
      characterId,
      title: String(b.title ?? 'Untitled story'),
      blurb: String(b.blurb ?? ''),
      format: 'arc',
      spec: v.spec as unknown as Record<string, unknown>,
    });
    return res.json({ story });
  } catch (err) {
    console.error('[studio] create failed:', err);
    return res.status(500).json({ error: 'create_failed' });
  }
});

// --- List ------------------------------------------------------------------
router.get('/stories', requireAuth, async (req: Request, res: Response) => {
  const characterId = req.query.characterId ? String(req.query.characterId) : undefined;
  try {
    const stories = await listUserStories(req.user!.id, characterId);
    return res.json({ stories });
  } catch (err) {
    console.error('[studio] list failed:', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

// --- Get one ---------------------------------------------------------------
router.get('/stories/:id', requireAuth, async (req: Request, res: Response) => {
  const story = await getUserStory(req.params.id);
  if (!story || story.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  return res.json({ story });
});

// --- Update (arc) ----------------------------------------------------------
router.put('/stories/:id', requireAuth, async (req: Request, res: Response) => {
  const existing = await getUserStory(req.params.id);
  if (!existing || existing.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  if (existing.format !== 'arc') return res.status(400).json({ error: 'unsupported_format' });

  const b = (req.body ?? {}) as Record<string, unknown>;
  const characterId = String(b.characterId ?? existing.characterId);
  if (!characterId) return res.status(400).json({ error: 'missing_character' });
  if (!(await resolveStudioCharacter(characterId, req.user!.id))) {
    return res.status(400).json({ error: 'unknown_character' });
  }

  const v = validateArcSpec(b);
  if (!v.ok || !v.spec) return res.status(400).json({ error: 'invalid_spec', detail: v.error });

  try {
    const story = await updateUserStory(req.user!.id, existing.id, {
      characterId,
      title: String(b.title ?? existing.title),
      blurb: String(b.blurb ?? ''),
      spec: v.spec as unknown as Record<string, unknown>,
    });
    if (!story) return res.status(404).json({ error: 'not_found' });
    return res.json({ story });
  } catch (err) {
    console.error('[studio] update failed:', err);
    return res.status(500).json({ error: 'update_failed' });
  }
});

// --- Delete ----------------------------------------------------------------
router.delete('/stories/:id', requireAuth, async (req: Request, res: Response) => {
  const ok = await deleteUserStory(req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  return res.json({ ok: true });
});

// --- Play (activate the arc for this character's chat) ----------------------
router.post('/stories/:id/play', requireAuth, async (req: Request, res: Response) => {
  const story = await getUserStory(req.params.id);
  if (!story || story.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  if (story.format !== 'arc') return res.status(400).json({ error: 'unsupported_format' });

  try {
    const userId = req.user!.id;
    const { characterId } = story;

    if (characterId.startsWith('user:')) {
      const ok = await ensureUserCharacterLoaded(characterId, userId);
      if (!ok) return res.status(400).json({ error: 'unknown_character' });
    }

    await getSituation(userId, characterId);

    const completed = await getCompletedArcIds(userId, characterId);
    if (!hasCompletedMeetArc(characterId, completed)) {
      return res.status(403).json({
        error: 'meet_arc_required',
        message: 'Finish your first meeting with this character before starting a story arc.',
      });
    }

    await setArcActive(userId, characterId, `user:${story.id}`);
    await resetSceneComposition(userId, characterId);

    const arc = userStoryToArc(story);
    const introNarrative = arc ? (arcOpeningLine(arc) ?? '') : '';

    if (introNarrative) {
      await pool.query(
        `INSERT INTO chat_messages (user_id, character_id, role, content)
         VALUES ($1, $2, 'assistant', $3)`,
        [userId, characterId, `[NARRATOR] ${introNarrative}`],
      );
    }

    return res.json({
      ok: true,
      characterId,
      introNarrative,
      storyTitle: story.title,
    });
  } catch (err) {
    console.error('[studio] play failed:', err);
    return res.status(500).json({ error: 'play_failed' });
  }
});

// --- Stop (clear the active arc) -------------------------------------------
router.post('/stories/:id/stop', requireAuth, async (req: Request, res: Response) => {
  const story = await getUserStory(req.params.id);
  if (!story || story.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  try {
    await clearArc(req.user!.id, story.characterId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[studio] stop failed:', err);
    return res.status(500).json({ error: 'stop_failed' });
  }
});

// --- Studio vocabulary + random drafts (template-based) --------------------

router.get('/vocabulary', requireAuth, (_req: Request, res: Response) => {
  return res.json(studioVocabularyPayload());
});

router.post('/random/character', requireAuth, (_req: Request, res: Response) => {
  try {
    return res.json({ draft: randomCharacterDraft() });
  } catch (err) {
    console.error('[studio] random character failed:', err);
    return res.status(500).json({ error: 'random_failed' });
  }
});

router.post('/random/arc', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const userId = req.user!.id;
  let characterId = typeof b.characterId === 'string' ? b.characterId.trim() : '';
  if (!characterId) {
    const customs = await listUserCharacters(userId);
    characterId = pickRandomCharacterId(customs.map((c) => c.id));
  }
  if (!(await resolveStudioCharacter(characterId, userId))) {
    return res.status(400).json({ error: 'invalid_character' });
  }
  let displayName: string | undefined;
  if (characterId.startsWith('user:')) {
    const row = await getUserCharacter(characterId.slice('user:'.length));
    displayName = row?.displayName;
  }
  try {
    const draft = randomArcDraft(characterId, { displayName });
    return res.json({ draft });
  } catch (err) {
    console.error('[studio] random arc failed:', err);
    return res.status(500).json({ error: 'random_failed' });
  }
});

router.post('/random/pack', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const userId = req.user!.id;
  let characterId = typeof b.characterId === 'string' ? b.characterId.trim() : '';
  if (!characterId) {
    const customs = await listUserCharacters(userId);
    characterId = pickRandomCharacterId(customs.map((c) => c.id));
  }
  if (!(await resolveStudioCharacter(characterId, userId))) {
    return res.status(400).json({ error: 'invalid_character' });
  }
  let displayName: string | undefined;
  if (characterId.startsWith('user:')) {
    const row = await getUserCharacter(characterId.slice('user:'.length));
    displayName = row?.displayName;
  }
  try {
    const draft = randomPackDraft(characterId, { displayName });
    return res.json({ draft });
  } catch (err) {
    console.error('[studio] random pack failed:', err);
    return res.status(500).json({ error: 'random_failed' });
  }
});

export default router;
