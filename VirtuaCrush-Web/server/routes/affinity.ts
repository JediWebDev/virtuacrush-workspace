// REST endpoints for reading affinity state.
// Writes happen internally in the chat route — never directly from the client.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getAffinity, getAllAffinity } from '../db/affinity';

const router = Router();

// GET /api/affinity — returns all character scores for the logged-in user
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const scores = await getAllAffinity(req.user!.id);
    res.json({ scores });
  } catch (err) {
    console.error('[affinity] get all failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/affinity/:characterId — returns a single character's score
router.get('/:characterId', requireAuth, async (req: Request, res: Response) => {
  try {
    const score = await getAffinity(req.user!.id, req.params.characterId);
    res.json({ characterId: req.params.characterId, score });
  } catch (err) {
    console.error('[affinity] get single failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
