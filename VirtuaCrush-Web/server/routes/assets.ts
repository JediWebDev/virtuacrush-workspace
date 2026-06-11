// Asset proxy: serves images (and other media) from the private Cloudflare R2
// bucket via the S3 API, with a graceful fallback to the bundled /public files
// when R2 is not configured or the object is missing. This keeps the bucket
// private (no public r2.dev URL needed) and lets the browser cache aggressively.
//
// GET /api/assets/<key>            e.g. /api/assets/scenes/coffee_shop.jpg
// Config + diagnostics live in server/lib/r2.ts.
import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import type { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET } from '../lib/r2';

const router = Router();

const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function contentTypeFor(key: string): string {
  return MIME[path.extname(key).toLowerCase()] ?? 'application/octet-stream';
}

// Directories to look in when R2 misses: the built SPA's public dir in
// production, the repo's /public in dev. For a key like
// "characters/Mina_Character.png" we also try the bare filename so existing
// flat /public files keep working without re-organizing them.
const FALLBACK_DIRS = [
  path.resolve(process.env.STATIC_DIR || 'dist/public'),
  path.resolve('public'),
];

function localFallbackPath(key: string): string | null {
  const candidates = [key, path.basename(key)];
  for (const dir of FALLBACK_DIRS) {
    for (const rel of candidates) {
      const full = path.resolve(dir, rel);
      if (!full.startsWith(dir + path.sep)) continue; // path traversal guard
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    }
  }
  return null;
}

function serveLocal(key: string, res: Response): boolean {
  const file = localFallbackPath(key);
  if (!file) return false;
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.sendFile(file);
  return true;
}

router.get('/*', async (req: Request, res: Response) => {
  const rawKey = (req.params as Record<string, string>)[0] ?? '';
  const key = rawKey.replace(/^\/+/, '');

  // Allow only sane object keys: no traversal, no hidden files, no empty key.
  if (!key || key.includes('..') || key.includes('\\') || key.startsWith('.')) {
    return res.status(400).json({ error: 'invalid_key' });
  }

  if (r2) {
    try {
      const obj = await r2.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          IfNoneMatch: req.headers['if-none-match'],
        }),
      );
      res.status(200);
      res.setHeader('Content-Type', obj.ContentType || contentTypeFor(key));
      res.setHeader('Cache-Control', CACHE_CONTROL);
      if (obj.ETag) res.setHeader('ETag', obj.ETag);
      if (obj.ContentLength !== undefined) res.setHeader('Content-Length', String(obj.ContentLength));
      (obj.Body as Readable).pipe(res);
      return;
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode;
      if (status === 304) {
        return res.status(304).end();
      }
      const missing = status === 404 || err?.name === 'NoSuchKey' || err?.Code === 'NoSuchKey';
      if (!missing) {
        console.error(`[assets] R2 error for "${key}":`, err?.name ?? err);
      }
      // fall through to the local fallback on any failure
    }
  }

  if (serveLocal(key, res)) return;
  return res.status(404).json({ error: 'not_found' });
});

export default router;
