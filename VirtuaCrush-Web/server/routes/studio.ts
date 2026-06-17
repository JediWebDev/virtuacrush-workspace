// Story Studio routes — user-authored content, private to the creator.
//
// Arcs (Phase 1): freeform story arcs for existing/custom characters.
// Characters (Phase 2): custom companions.
// Adventures (Phase 3): branching CYOA story packs (format='pack'), which
//   surface in the in-chat story list and are played by the pack director.
//
// POST   /api/studio/stories            — create an arc
// GET    /api/studio/stories?characterId — list my stories (optionally per character)
// GET    /api/studio/stories/:id        — get one (owner only)
// DELETE /api/studio/stories/:id        — delete (owner only)
// POST   /api/studio/stories/:id/play   — activate this arc for the chat with its character
// POST   /api/studio/stories/:id/stop   — clear the active arc
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createUserStory, listUserStories, getUserStory, deleteUserStory,
  setStoryVisibility, type UserStory,
} from '../db/user_stories';
import {
  createUserCharacter, listUserCharacters, deleteUserCharacter, getUserCharacter,
  ensureUserCharacterLoaded, setCharacterVisibility, setCharacterImage, type UserCharacter,
} from '../db/user_characters';
import { validateArcSpec } from '../inworld/user_arc';
import { validatePackSpec } from '../inworld/user_pack';
import { setArcActive, clearArc } from '../db/arc_state';
import { getSituation } from '../db/state';
import { getCharacter } from '../inworld/characters';
import { moderateText, moderateImage } from '../inworld/moderation';
import { generateImage } from '../llm/image';
import { putObject, getObjectBytes } from '../lib/r2';
import { isSubscribed } from '../db/subscriptions';
import { randomUUID } from 'node:crypto';

// Accepted avatar upload types (magic-byte sniffed) and the max decoded size.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
function sniffImageType(buf: Buffer): string | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
function extFor(mime: string): string {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
}
/** Decodes a base64 data URL into bytes (any prefix tolerated). */
function decodeImageDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:[^;]+;base64,(.+)$/s.exec((dataUrl ?? '').trim());
  if (!m) return null;
  try { return Buffer.from(m[1], 'base64'); } catch { return null; }
}
/** Builds the FLUX prompt for a character avatar from their persona. */
function avatarPrompt(c: UserCharacter, appearance?: string, style?: string): string {
  const styleLine = (style && style.trim()) || 'polished digital character portrait, soft cinematic lighting, detailed';
  const look = (appearance && appearance.trim()) ? `Appearance: ${appearance.trim()}. ` : '';
  return `Character portrait avatar of ${c.displayName}. ${look}Personality/context: ${c.core.slice(0, 600)}. ${c.tone ? `Mood/tone: ${c.tone}. ` : ''}Head-and-shoulders framing, centered, expressive face, ${styleLine}. No text, no watermark, no logo.`;
}

const router = Router();

/** True if `characterId` is a valid target for studio content owned by `userId`:
 *  a built-in id present in the registry, or a "user:" custom character owned by
 *  the requester (loaded so getCharacter() can later resolve it). */
async function resolveStudioCharacter(characterId: string, userId: string): Promise<boolean> {
  if (characterId.startsWith('user:')) {
    return ensureUserCharacterLoaded(characterId, userId);
  }
  try { getCharacter(characterId as Parameters<typeof getCharacter>[0]); return true; }
  catch { return false; }
}

/** A friendly creator name for attribution. */
function creatorName(req: Request): string {
  return req.user!.name?.trim() || req.user!.email.split('@')[0] || 'A creator';
}

/** Flattens a character's author text for the moderation check. */
function characterText(c: UserCharacter): string {
  return [c.displayName, c.tone, c.core, c.greeting, c.secret].filter(Boolean).join('\n');
}

/** Flattens a story (arc or pack) spec into author text for moderation. */
function storyText(s: UserStory): string {
  const parts: string[] = [s.title, s.blurb];
  const spec = s.spec as Record<string, unknown>;
  for (const k of ['setting', 'situation', 'playerSituation', 'npcInstruction', 'introNarrative', 'completionCriteria', 'systemInstruction']) {
    if (typeof spec[k] === 'string') parts.push(spec[k] as string);
  }
  const nodes = spec.nodes as Record<string, { npcInstruction?: string; introNarrative?: string; choices?: { label?: string; userMessage?: string }[] | null }> | undefined;
  if (nodes) {
    for (const n of Object.values(nodes)) {
      if (n.npcInstruction) parts.push(n.npcInstruction);
      if (n.introNarrative) parts.push(n.introNarrative);
      for (const c of n.choices ?? []) parts.push(`${c.label ?? ''} ${c.userMessage ?? ''}`);
    }
  }
  return parts.filter(Boolean).join('\n');
}

// ===========================================================================
// Custom characters (Phase 2) — private to the creator.
// ===========================================================================

// POST /api/studio/characters { displayName, core, greeting?, secret?, tone? }
router.post('/characters', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const displayName = String(b.displayName ?? '').trim();
  const core = String(b.core ?? '').trim();
  if (!displayName) return res.status(400).json({ error: 'missing_name' });
  if (core.length < 20) return res.status(400).json({ error: 'persona_too_short' });
  try {
    const character = await createUserCharacter({
      ownerUserId: req.user!.id,
      displayName,
      core,
      greeting: typeof b.greeting === 'string' ? b.greeting : '',
      secret: typeof b.secret === 'string' && b.secret.trim() ? b.secret.trim() : null,
      tone: typeof b.tone === 'string' && b.tone.trim() ? b.tone.trim() : null,
    });
    return res.json({ character });
  } catch (err) {
    console.error('[studio] character create failed:', err);
    return res.status(500).json({ error: 'create_failed' });
  }
});

// GET /api/studio/characters — my custom characters
router.get('/characters', requireAuth, async (req: Request, res: Response) => {
  try {
    const characters = await listUserCharacters(req.user!.id);
    return res.json({ characters });
  } catch (err) {
    console.error('[studio] character list failed:', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

// GET /api/studio/characters/:id — one custom character (owner only)
router.get('/characters/:id', requireAuth, async (req: Request, res: Response) => {
  const character = await getUserCharacter(req.params.id);
  if (!character || character.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  return res.json({ character });
});

// DELETE /api/studio/characters/:id
router.delete('/characters/:id', requireAuth, async (req: Request, res: Response) => {
  const ok = await deleteUserCharacter(req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  return res.json({ ok: true });
});

// POST /api/studio/characters/:id/publish — run moderation, go public if it passes
router.post('/characters/:id/publish', requireAuth, async (req: Request, res: Response) => {
  const c = await getUserCharacter(req.params.id);
  if (!c || c.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });

  // Text safety check first.
  let verdict = await moderateText(characterText(c));

  // If it has a published avatar, run a vision safety check on the image too.
  if (verdict.allow && c.imageKey) {
    const obj = await getObjectBytes(c.imageKey);
    if (obj) {
      const dataUrl = `data:${obj.contentType};base64,${obj.body.toString('base64')}`;
      const imgVerdict = await moderateImage(dataUrl);
      if (!imgVerdict.allow) verdict = { allow: false, reason: imgVerdict.reason || 'The avatar image was flagged by the safety review.' };
    }
  }

  const updated = verdict.allow
    ? await setCharacterVisibility(req.user!.id, c.id, { visibility: 'public', moderationStatus: 'approved', reason: null, creatorName: creatorName(req) })
    : await setCharacterVisibility(req.user!.id, c.id, { visibility: 'private', moderationStatus: 'rejected', reason: verdict.reason });
  return res.json({ character: updated, allowed: verdict.allow, reason: verdict.reason });
});

// POST /api/studio/characters/:id/unpublish — make private again
router.post('/characters/:id/unpublish', requireAuth, async (req: Request, res: Response) => {
  const c = await getUserCharacter(req.params.id);
  if (!c || c.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const updated = await setCharacterVisibility(req.user!.id, c.id, { visibility: 'private', moderationStatus: 'approved', reason: null });
  return res.json({ character: updated });
});

// --- Avatar image: upload / generate / remove -------------------------------

// POST /api/studio/characters/:id/image  { dataUrl } — upload an avatar
router.post('/characters/:id/image', requireAuth, async (req: Request, res: Response) => {
  const c = await getUserCharacter(req.params.id);
  if (!c || c.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });

  const buf = decodeImageDataUrl(String((req.body ?? {}).dataUrl ?? ''));
  if (!buf) return res.status(400).json({ error: 'invalid_image' });
  if (buf.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'image_too_large' });
  const mime = sniffImageType(buf);
  if (!mime) return res.status(400).json({ error: 'unsupported_image_type' });

  const key = `user-content/${req.user!.id}/characters/${c.id}/${randomUUID()}.${extFor(mime)}`;
  try {
    await putObject(key, buf, mime);
    await setCharacterImage(req.user!.id, c.id, key);
    return res.json({ imageKey: key });
  } catch (err) {
    console.error('[studio] image upload failed:', err);
    return res.status(500).json({ error: 'upload_failed' });
  }
});

// POST /api/studio/characters/:id/image/generate  { appearance?, style? } — Pro only
router.post('/characters/:id/image/generate', requireAuth, async (req: Request, res: Response) => {
  const c = await getUserCharacter(req.params.id);
  if (!c || c.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });

  // Pro-gated by default. IMAGE_GEN_FOR_ALL=1 opens it to everyone (useful for
  // testing/launch promos) without removing the gate from the codebase.
  const proOk = process.env.IMAGE_GEN_FOR_ALL === '1' || (await isSubscribed(req.user!.id));
  if (!proOk) return res.status(403).json({ error: 'pro_required' });

  const b = (req.body ?? {}) as { appearance?: string; style?: string };
  try {
    const img = await generateImage(avatarPrompt(c, b.appearance, b.style));
    const ext = extFor(img.contentType.includes('png') ? 'image/png' : img.contentType);
    const key = `user-content/${req.user!.id}/characters/${c.id}/${randomUUID()}.${ext}`;
    await putObject(key, img.body, img.contentType);
    await setCharacterImage(req.user!.id, c.id, key);
    return res.json({ imageKey: key });
  } catch (err) {
    const detail = (err as Error)?.message ?? String(err);
    console.error('[studio] image generation failed:', detail);
    // Distinguish a storage/permission failure (R2) from a model-call failure so
    // the cause is obvious. "Access Denied" = the R2 token lacks write permission.
    const storage = /not configured|access denied|forbidden|denied|credential|signature|bucket|\bR2\b|s3/i.test(detail);
    return res.status(502).json({ error: storage ? 'storage_failed' : 'generation_failed', detail });
  }
});

// DELETE /api/studio/characters/:id/image — revert to the initials avatar
router.delete('/characters/:id/image', requireAuth, async (req: Request, res: Response) => {
  const c = await getUserCharacter(req.params.id);
  if (!c || c.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  await setCharacterImage(req.user!.id, c.id, null);
  return res.json({ ok: true });
});

// --- Shared publish/unpublish for stories (arcs) AND packs (adventures) -----
async function handleStoryPublish(req: Request, res: Response) {
  const s = await getUserStory(req.params.id);
  if (!s || s.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });

  const verdict = await moderateText(storyText(s));
  const updated = verdict.allow
    ? await setStoryVisibility(req.user!.id, s.id, { visibility: 'public', moderationStatus: 'approved', reason: null, creatorName: creatorName(req) })
    : await setStoryVisibility(req.user!.id, s.id, { visibility: 'private', moderationStatus: 'rejected', reason: verdict.reason });
  return res.json({ story: updated, pack: updated, allowed: verdict.allow, reason: verdict.reason });
}
async function handleStoryUnpublish(req: Request, res: Response) {
  const s = await getUserStory(req.params.id);
  if (!s || s.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  const updated = await setStoryVisibility(req.user!.id, s.id, { visibility: 'private', moderationStatus: 'approved', reason: null });
  return res.json({ story: updated, pack: updated });
}
router.post('/stories/:id/publish', requireAuth, handleStoryPublish);
router.post('/stories/:id/unpublish', requireAuth, handleStoryUnpublish);
router.post('/packs/:id/publish', requireAuth, handleStoryPublish);
router.post('/packs/:id/unpublish', requireAuth, handleStoryUnpublish);

// ===========================================================================
// Custom CYOA adventures (Phase 3) — branching story packs, private to creator.
// Stored in user_stories with format='pack'. They surface in the in-chat story
// list (GET /api/packs) and are played by the existing pack director.
// ===========================================================================

// POST /api/studio/packs { characterId, title, blurb?, mood?, setting?, situation, coPresent?, systemInstruction, nodes }
router.post('/packs', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const characterId = String(b.characterId ?? '');
  if (!characterId) return res.status(400).json({ error: 'missing_character' });
  if (!(await resolveStudioCharacter(characterId, req.user!.id))) {
    return res.status(400).json({ error: 'unknown_character' });
  }

  const v = validatePackSpec(b);
  if (!v.ok || !v.spec) return res.status(400).json({ error: 'invalid_spec', detail: v.error });

  try {
    const story = await createUserStory({
      ownerUserId: req.user!.id,
      characterId,
      title: v.spec.title,
      blurb: v.spec.blurb,
      format: 'pack',
      spec: v.spec as unknown as Record<string, unknown>,
    });
    return res.json({ pack: story });
  } catch (err) {
    console.error('[studio] pack create failed:', err);
    return res.status(500).json({ error: 'create_failed' });
  }
});

// GET /api/studio/packs?characterId — my adventures (optionally per character)
router.get('/packs', requireAuth, async (req: Request, res: Response) => {
  const characterId = req.query.characterId ? String(req.query.characterId) : undefined;
  try {
    const all = await listUserStories(req.user!.id, characterId);
    return res.json({ packs: all.filter((s) => s.format === 'pack') });
  } catch (err) {
    console.error('[studio] pack list failed:', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

// GET /api/studio/packs/:id — one adventure (owner only)
router.get('/packs/:id', requireAuth, async (req: Request, res: Response) => {
  const story = await getUserStory(req.params.id);
  if (!story || story.ownerUserId !== req.user!.id || story.format !== 'pack') {
    return res.status(404).json({ error: 'not_found' });
  }
  return res.json({ pack: story });
});

// DELETE /api/studio/packs/:id
router.delete('/packs/:id', requireAuth, async (req: Request, res: Response) => {
  const story = await getUserStory(req.params.id);
  if (!story || story.ownerUserId !== req.user!.id || story.format !== 'pack') {
    return res.status(404).json({ error: 'not_found' });
  }
  const ok = await deleteUserStory(req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  return res.json({ ok: true });
});

// --- Create (arc) ----------------------------------------------------------
router.post('/stories', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const characterId = String(b.characterId ?? '');
  const format = String(b.format ?? 'arc');

  if (!characterId) return res.status(400).json({ error: 'missing_character' });
  if (!(await resolveStudioCharacter(characterId, req.user!.id))) {
    return res.status(400).json({ error: 'unknown_character' });
  }
  if (format !== 'arc') return res.status(400).json({ error: 'unsupported_format' });

  const v = validateArcSpec(b);
  if (!v.ok || !v.spec) return res.status(400).json({ error: 'invalid_spec', detail: v.error });

  try {
    const story = await createUserStory({
      ownerUserId: req.user!.id,
      characterId,
      title: String(b.title ?? 'Untitled story'),
      blurb: String(b.blurb ?? ''),
      format: 'arc',
      spec: v.spec as unknown as Record<string, unknown>,
    });
    return res.json({ story });
  } catch (err) {
    console.error('[studio] create failed:', err);
    return res.status(500).json({ error: 'create_failed' });
  }
});

// --- List ------------------------------------------------------------------
router.get('/stories', requireAuth, async (req: Request, res: Response) => {
  const characterId = req.query.characterId ? String(req.query.characterId) : undefined;
  try {
    const stories = await listUserStories(req.user!.id, characterId);
    return res.json({ stories });
  } catch (err) {
    console.error('[studio] list failed:', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

// --- Get one ---------------------------------------------------------------
router.get('/stories/:id', requireAuth, async (req: Request, res: Response) => {
  const story = await getUserStory(req.params.id);
  if (!story || story.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  return res.json({ story });
});

// --- Delete ----------------------------------------------------------------
router.delete('/stories/:id', requireAuth, async (req: Request, res: Response) => {
  const ok = await deleteUserStory(req.user!.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  return res.json({ ok: true });
});

// --- Play (activate the arc for this character's chat) ----------------------
router.post('/stories/:id/play', requireAuth, async (req: Request, res: Response) => {
  const story = await getUserStory(req.params.id);
  if (!story || story.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  if (story.format !== 'arc') return res.status(400).json({ error: 'unsupported_format' });

  try {
    // Ensure the character_state row exists first — setArcActive is a pure
    // UPDATE and would silently no-op for a character the user hasn't chatted
    // with yet (no row), leaving the arc inactive.
    await getSituation(req.user!.id, story.characterId);
    await setArcActive(req.user!.id, story.characterId, `user:${story.id}`);
    const intro = (story.spec as Record<string, unknown>).introNarrative;
    return res.json({
      ok: true,
      characterId: story.characterId,
      introNarrative: typeof intro === 'string' ? intro : '',
    });
  } catch (err) {
    console.error('[studio] play failed:', err);
    return res.status(500).json({ error: 'play_failed' });
  }
});

// --- Stop (clear the active arc) -------------------------------------------
router.post('/stories/:id/stop', requireAuth, async (req: Request, res: Response) => {
  const story = await getUserStory(req.params.id);
  if (!story || story.ownerUserId !== req.user!.id) return res.status(404).json({ error: 'not_found' });
  try {
    await clearArc(req.user!.id, story.characterId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[studio] stop failed:', err);
    return res.status(500).json({ error: 'stop_failed' });
  }
});

export default router;
