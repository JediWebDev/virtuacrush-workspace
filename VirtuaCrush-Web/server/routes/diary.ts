// Read endpoint for the story-so-far diary (beats extracted from past chats).
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { listDiary } from '../db/diary';

const router = Router();

// GET /api/diary/:characterId — newest beats first
router.get('/:characterId', requireAuth, async (req: Request, res: Response) => {
  try {
    const entries = await listDiary(req.user!.id, req.params.characterId);
    res.json({ entries });
  } catch (err) {
    console.error('[diary] list failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
