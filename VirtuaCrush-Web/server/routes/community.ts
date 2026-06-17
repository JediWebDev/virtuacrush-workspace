// Community routes (Phase 4) — browse public, approved custom content and copy
// it into your own library. Copy-to-library keeps each user's data isolated:
// opening a community item clones it (attributed to the original creator), and
// the user then chats/plays their own copy.
//
// GET  /api/community/characters           — public custom companions
// GET  /api/community/adventures           — public CYOA packs
// GET  /api/community/arcs                  — public freeform arcs
// POST /api/community/characters/:id/copy   — clone a character into my library
// POST /api/community/adventures/:id/copy   — clone an adventure (and its companion)
// POST /api/community/arcs/:id/copy          — clone an arc into my library
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { listPublicCharacters, copyCharacterToUser, getPublicCharacter } from '../db/user_characters';
import { listPublicStories, copyStoryToUser } from '../db/user_stories';
import { getCharacter } from '../inworld/characters';

const router = Router();

/** A human label for the companion a story stars (built-in name or custom). */
async function companionLabel(characterId: string): Promise<string> {
  if (characterId.startsWith('user:')) {
    const c = await getPublicCharacter(characterId.slice('user:'.length));
    return c ? c.displayName : 'Custom companion';
  }
  try { return getCharacter(characterId as Parameters<typeof getCharacter>[0]).displayName; }
  catch { return characterId; }
}

function excerpt(text: string, n = 180): string {
  const t = (text ?? '').trim();
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
}

// --- Browse ----------------------------------------------------------------
router.get('/characters', requireAuth, async (_req: Request, res: Response) => {
  try {
    const chars = await listPublicCharacters();
    return res.json({
      characters: chars.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        blurb: excerpt(c.core),
        tone: c.tone,
        creatorName: c.creatorName,
        copyCount: c.copyCount,
      })),
    });
  } catch (err) {
    console.error('[community] characters failed:', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

router.get('/adventures', requireAuth, async (_req: Request, res: Response) => {
  try {
    const packs = await listPublicStories('pack');
    const adventures = await Promise.all(packs.map(async (p) => ({
      id: p.id,
      title: p.title,
      blurb: p.blurb,
      companion: await companionLabel(p.characterId),
      mood: (p.spec as { mood?: string }).mood ?? null,
      beats: (p.spec as { nodes?: Record<string, unknown> }).nodes ? Object.keys((p.spec as { nodes: Record<string, unknown> }).nodes).length : 0,
      creatorName: p.creatorName,
      copyCount: p.copyCount,
    })));
    return res.json({ adventures });
  } catch (err) {
    console.error('[community] adventures failed:', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

router.get('/arcs', requireAuth, async (_req: Request, res: Response) => {
  try {
    const arcs = await listPublicStories('arc');
    const out = await Promise.all(arcs.map(async (a) => ({
      id: a.id,
      title: a.title,
      blurb: a.blurb || excerpt((a.spec as { situation?: string }).situation ?? ''),
      companion: await companionLabel(a.characterId),
      setting: (a.spec as { setting?: string }).setting ?? null,
      creatorName: a.creatorName,
      copyCount: a.copyCount,
    })));
    return res.json({ arcs: out });
  } catch (err) {
    console.error('[community] arcs failed:', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

// --- Copy into my library --------------------------------------------------
router.post('/characters/:id/copy', requireAuth, async (req: Request, res: Response) => {
  const copy = await copyCharacterToUser(req.params.id, req.user!.id);
  if (!copy) return res.status(404).json({ error: 'not_found' });
  return res.json({ id: copy.id, ref: `user:${copy.id}`, displayName: copy.displayName });
});

router.post('/adventures/:id/copy', requireAuth, async (req: Request, res: Response) => {
  const copy = await copyStoryToUser(req.params.id, req.user!.id);
  if (!copy) return res.status(404).json({ error: 'not_found' });
  return res.json({ id: copy.id, characterId: copy.characterId, title: copy.title });
});

router.post('/arcs/:id/copy', requireAuth, async (req: Request, res: Response) => {
  const copy = await copyStoryToUser(req.params.id, req.user!.id);
  if (!copy) return res.status(404).json({ error: 'not_found' });
  return res.json({ id: copy.id, characterId: copy.characterId, title: copy.title });
});

export default router;
