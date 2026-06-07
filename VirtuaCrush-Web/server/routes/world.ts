// Living-world endpoint: on load, run idle catch-up (capped) and return the
// activity log + a "while you were away" digest.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { runCatchUp } from '../db/sim_world';
import { listWorldEvents } from '../db/world_sim';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const summary = await runCatchUp(req.user!.id); // [] if not idle long enough
    const events = await listWorldEvents(req.user!.id, 40);
    res.json({ events, summary });
  } catch (err) {
    console.error('[world] failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
