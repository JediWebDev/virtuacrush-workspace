// Player profile + wardrobe API. The profile is the source of truth for identity
// and current presentation; the avatar page reads/writes it here.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getFullProfile, upsertProfile, addItem, deleteItem } from '../db/profile';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json(await getFullProfile(req.user!.id));
  } catch (err) {
    console.error('[profile] get failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.put('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    await upsertProfile(req.user!.id, {
      displayName: typeof b.displayName === 'string' ? b.displayName.slice(0, 80) : '',
      appearance: (b.appearance ?? {}) as never,
      biography: (b.biography ?? {}) as never,
      grooming: (b.grooming ?? {}) as never,
      wornItemIds: Array.isArray(b.wornItemIds) ? (b.wornItemIds as string[]) : [],
      presets: Array.isArray(b.presets) ? (b.presets as never) : [],
    });
    res.json(await getFullProfile(req.user!.id));
  } catch (err) {
    console.error('[profile] update failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/items', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'name_required' });
  try {
    const item = await addItem(req.user!.id, {
      name,
      category: typeof b.category === 'string' ? b.category : 'other',
      styleTags: Array.isArray(b.styleTags) ? (b.styleTags as string[]) : [],
      rarity: typeof b.rarity === 'string' ? b.rarity : undefined,
    });
    res.json({ item });
  } catch (err) {
    console.error('[profile] add item failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.delete('/items/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const ok = await deleteItem(req.user!.id, req.params.id);
    res.json({ ok });
  } catch (err) {
    console.error('[profile] delete item failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
