// Activity log endpoint — returns persisted world events for the logged-in user.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { listWorldEvents } from '../db/world_sim';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const events = await listWorldEvents(req.user!.id, 40);
    res.json({ events, summary: [] });
  } catch (err) {
    console.error('[world] failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
