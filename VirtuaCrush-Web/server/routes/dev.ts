// Dev-only utilities (character progress reset, etc.). Disabled in production
// unless ALLOW_DEV_RESET=1 is explicitly set.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { isDevResetEnabled, resetCharacterDevState } from '../db/dev_reset';
import { ensureUserCharacterLoaded } from '../db/user_characters';

const router = Router();

function devOnly(_req: Request, res: Response, next: NextFunction) {
  if (!isDevResetEnabled()) {
    return res.status(404).json({ error: 'not_found' });
  }
  next();
}

router.get('/enabled', (_req, res) => {
  res.json({ enabled: isDevResetEnabled() });
});

router.post('/reset-character/:characterId', requireAuth, devOnly, async (req: Request, res: Response) => {
  const { characterId } = req.params;
  if (!characterId?.trim()) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  if (characterId.startsWith('user:')) {
    const ok = await ensureUserCharacterLoaded(characterId, req.user!.id);
    if (!ok) return res.status(404).json({ error: 'unknown_character' });
  }

  try {
    await resetCharacterDevState(req.user!.id, characterId);
    return res.json({ ok: true, characterId });
  } catch (err) {
    console.error('[dev] reset-character failed:', err);
    return res.status(500).json({ error: 'reset_failed' });
  }
});

export default router;
