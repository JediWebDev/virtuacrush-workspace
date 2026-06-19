// Player profile + wardrobe API. The profile is the source of truth for identity
// and current presentation; the avatar page reads/writes it here.
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware/auth';
import { getFullProfile, upsertProfile, addItem, deleteItem, setAvatarKey } from '../db/profile';
import { isSubscribed } from '../db/subscriptions';
import { generateImage } from '../llm/image';
import { putObject } from '../lib/r2';
import { decodeImageDataUrl, extFor, MAX_IMAGE_BYTES, sniffImageType } from '../lib/image_upload';

const router = Router();

function playerAvatarPrompt(displayName: string, appearance?: string): string {
  const look = appearance?.trim() ? `${appearance.trim()}. ` : '';
  return (
    `Player profile portrait of ${displayName || 'a person'}. ${look}` +
    'Head-and-shoulders framing, centered, expressive face, soft painterly style. No text, no watermark, no logo.'
  );
}

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

router.post('/avatar', requireAuth, async (req: Request, res: Response) => {
  const buf = decodeImageDataUrl(String((req.body ?? {}).dataUrl ?? ''));
  if (!buf) return res.status(400).json({ error: 'invalid_image' });
  if (buf.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'image_too_large' });
  const mime = sniffImageType(buf);
  if (!mime) return res.status(400).json({ error: 'unsupported_image_type' });

  const key = `user-content/${req.user!.id}/avatar/${randomUUID()}.${extFor(mime)}`;
  try {
    await putObject(key, buf, mime);
    await setAvatarKey(req.user!.id, key);
    return res.json({ avatarKey: key });
  } catch (err) {
    console.error('[profile] avatar upload failed:', err);
    return res.status(500).json({ error: 'upload_failed' });
  }
});

router.post('/avatar/generate', requireAuth, async (req: Request, res: Response) => {
  const proOk = process.env.IMAGE_GEN_FOR_ALL === '1' || (await isSubscribed(req.user!.id));
  if (!proOk) return res.status(403).json({ error: 'pro_required' });

  const b = (req.body ?? {}) as { appearance?: string };
  const full = await getFullProfile(req.user!.id);
  const appearance = b.appearance?.trim() || full.profile.appearance?.features || full.profile.appearance?.hair;

  try {
    const img = await generateImage(playerAvatarPrompt(full.profile.displayName, appearance));
    const ext = extFor(img.contentType.includes('png') ? 'image/png' : img.contentType);
    const key = `user-content/${req.user!.id}/avatar/${randomUUID()}.${ext}`;
    await putObject(key, img.body, img.contentType);
    await setAvatarKey(req.user!.id, key);
    return res.json({ avatarKey: key });
  } catch (err) {
    const detail = (err as Error)?.message ?? String(err);
    console.error('[profile] avatar generation failed:', detail);
    const storage = /not configured|access denied|forbidden|denied|credential|signature|bucket|\bR2\b|s3/i.test(detail);
    return res.status(502).json({ error: storage ? 'storage_failed' : 'generation_failed', detail });
  }
});

router.delete('/avatar', requireAuth, async (req: Request, res: Response) => {
  try {
    await setAvatarKey(req.user!.id, null);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[profile] avatar delete failed:', err);
    return res.status(500).json({ error: 'internal_error' });
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
