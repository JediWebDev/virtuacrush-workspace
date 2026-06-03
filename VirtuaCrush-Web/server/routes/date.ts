// Date control endpoints. POST /api/date/:characterId/end starts the bill flow.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { createEndDateBill } from '../db/choices';

const router = Router();

// POST /api/date/:characterId/end — generate the itemized bill choice
router.post('/:characterId/end', requireAuth, async (req: Request, res: Response) => {
  try {
    const choice = await createEndDateBill(req.user!.id, req.params.characterId);
    if (!choice) return res.status(409).json({ error: 'not_on_date' });
    res.json({ choice });
  } catch (err) {
    console.error('[date] end failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
