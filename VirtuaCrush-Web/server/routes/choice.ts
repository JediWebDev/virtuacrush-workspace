// Endpoints for timed dialogue choices.
// Creation happens inside the chat stream; these handle resume, selection,
// and timeout. The server is authoritative on the deadline.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getActiveChoice, selectChoice, timeoutChoice } from '../db/choices';

const router = Router();

// GET /api/choice/:characterId — the active pending choice, if any (for resume)
router.get('/:characterId', requireAuth, async (req: Request, res: Response) => {
  try {
    const choice = await getActiveChoice(req.user!.id, req.params.characterId);
    res.json({ choice });
  } catch (err) {
    console.error('[choice] get active failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/choice/:id/select  { optionIndex: 0 | 1 }
router.post('/:id/select', requireAuth, async (req: Request, res: Response) => {
  const optionIndex = Number((req.body ?? {}).optionIndex);
  if (!Number.isInteger(optionIndex)) {
    return res.status(400).json({ error: 'invalid_option' });
  }
  try {
    const result = await selectChoice(req.user!.id, req.params.id, optionIndex);
    if (!result.ok) return res.status(result.error === 'not_found' ? 404 : 409).json(result);
    res.json(result);
  } catch (err) {
    console.error('[choice] select failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/choice/:id/timeout — user let the hourglass run out
router.post('/:id/timeout', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await timeoutChoice(req.user!.id, req.params.id);
    if (!result.ok) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    console.error('[choice] timeout failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
