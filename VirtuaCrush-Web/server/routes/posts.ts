// Read endpoint for a character's dynamic social posts (created when dialogue
// choices advance their goal). Merged ahead of the static feed in the UI.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { listPosts, createPost } from '../db/posts';

const router = Router();

// GET /api/posts/:characterId — dynamic posts for this user/character, newest first
router.get('/:characterId', requireAuth, async (req: Request, res: Response) => {
  try {
    const posts = await listPosts(req.user!.id, req.params.characterId);
    res.json({ posts });
  } catch (err) {
    console.error('[posts] list failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/posts/:characterId/share { text } — share a viral moment to the feed
router.post('/:characterId/share', requireAuth, async (req: Request, res: Response) => {
  const text = String((req.body ?? {}).text ?? '').trim();
  if (!text) return res.status(400).json({ error: 'empty_text' });
  try {
    await createPost(req.user!.id, req.params.characterId, text);
    res.json({ ok: true });
  } catch (err) {
    console.error('[posts] share failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
