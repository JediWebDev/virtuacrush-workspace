// Achievements endpoint — the player's earned milestones across all companions,
// for the profile display + sharing. Newest first; the client groups by character.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { listAchievements } from '../db/achievements';

const router = Router();

// GET /api/achievements — all achievements for the logged-in user.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const achievements = await listAchievements(req.user!.id);
    return res.json({ achievements });
  } catch (err) {
    console.error('[achievements] list failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
