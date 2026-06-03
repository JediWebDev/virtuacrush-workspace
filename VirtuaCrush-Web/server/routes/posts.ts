// Read endpoint for a character's dynamic social posts (created when dialogue
// choices advance their goal). Merged ahead of the static feed in the UI.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { listPosts } from '../db/posts';

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

export default router;
