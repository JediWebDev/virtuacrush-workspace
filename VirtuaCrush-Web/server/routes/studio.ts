// Story Studio routes — user-authored stories (Phase 1: arcs for existing
// characters, private to the creator).
//
// POST   /api/studio/stories            — create an arc
// GET    /api/studio/stories?characterId — list my stories (optionally per character)
// GET    /api/studio/stories/:id        — get one (owner only)
// DELETE /api/studio/stories/:id        — delete (owner only)
// POST   /api/studio/stories/:id/play   — activate this arc for the chat with its character
// POST   /api/studio/stories/:id/stop   — clear the active arc
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { createUserStory, listUserStories, getUserStory, deleteUserStory } from '../db/user_stories';
import { createUserCharacter, listUserCharacters, deleteUserCharacter } from '../db/user_characters';
import { validateArcSpec } from '../inworld/user_arc';
import { setArcActive, clearArc } from '../db/arc_state';
import { getSituation } from '../db/state';
import { getCharacter } from '../inworld/characters';

const router = Router();

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
      tone: typeof b.tone === 'string' && b.tone.trim() ? b.tone.trim() : null,
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

// DELETE /api/studio/characters/:id
router.delete('/characters/:id', requireAuth, async (req: Request, res: Response) => {
  const ok = await deleteUserCharacter(req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  return res.json({ ok: true });
});

// --- Create (arc) ----------------------------------------------------------
router.post('/stories', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const characterId = String(b.characterId ?? '');
  const format = String(b.format ?? 'arc');

  if (!characterId) return res.status(400).json({ error: 'missing_character' });
  // Phase 1: only built-in characters + arc format.
  try { getCharacter(characterId as Parameters<typeof getCharacter>[0]); }
  catch { return res.status(400).json({ error: 'unknown_character' }); }
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
    // Ensure the character_state row exists first — setArcActive is a pure
    // UPDATE and would silently no-op for a character the user hasn't chatted
    // with yet (no row), leaving the arc inactive.
    await getSituation(req.user!.id, story.characterId);
    await setArcActive(req.user!.id, story.characterId, `user:${story.id}`);
    const intro = (story.spec as Record<string, unknown>).introNarrative;
    return res.json({
      ok: true,
      characterId: story.characterId,
      introNarrative: typeof intro === 'string' ? intro : '',
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

export default router;
