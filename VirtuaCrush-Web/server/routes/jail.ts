// Jail endpoints. POST /api/jail/:characterId/bail spends the user's one phone
// call to ask the date for bail.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requestBail } from '../db/choices';

const router = Router();

router.post('/:characterId/bail', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await requestBail(req.user!.id, req.params.characterId);
    if (!result.ok) {
      return res.status(result.error === 'not_jailed' ? 409 : 409).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[jail] bail failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
