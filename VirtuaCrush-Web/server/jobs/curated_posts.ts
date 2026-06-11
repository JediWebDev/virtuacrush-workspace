// Curated feed sync: developers drop image+caption pairs into the R2 bucket
// and they become global feed posts. Convention (case-insensitive):
//   posts/Serena_selfie1.png  +  posts/Serena_selfie1.txt   (caption)
// Flat keys (Serena_selfie1.png at the bucket root) work too. The prefix
// before the first underscore must be a character id. Synced posts are
// deduped by object key, so this is safe to run repeatedly.
// R2 config + diagnostics live in server/lib/r2.ts.
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { r2, R2_BUCKET } from '../lib/r2';
import { createCuratedPost } from '../db/posts';
import { getCharacter } from '../inworld/characters';

const IMAGE_KEY = /(?:^|\/)([A-Za-z]+)_[^/]+\.(png|jpe?g|webp)$/;

async function readBody(key: string): Promise<string> {
  const obj = await r2!.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  for await (const c of obj.Body as Readable) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

/** Scans the bucket for image+caption pairs and inserts any new feed posts. */
export async function syncCuratedPosts(): Promise<void> {
  if (!r2) return; // R2 not configured — nothing to sync
  try {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await r2.send(
        new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken: token }),
      );
      for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    const keySet = new Set(keys);
    let added = 0;
    for (const key of keys) {
      const m = key.match(IMAGE_KEY);
      if (!m) continue;
      const characterId = m[1].toLowerCase();
      try { getCharacter(characterId); } catch { continue; } // unknown character prefix

      // Caption file with the same base name; posts without one are skipped
      // (the caption is what makes it a post rather than a stray asset).
      const txtKey = key.replace(/\.(png|jpe?g|webp)$/i, '.txt');
      if (!keySet.has(txtKey)) continue;

      const caption = (await readBody(txtKey).catch(() => '')).trim();
      if (!caption) continue;

      const inserted = await createCuratedPost(characterId, caption, `/api/assets/${key}`, key);
      if (inserted) added++;
    }
    if (added > 0) console.log(`[posts] curated sync added ${added} post(s)`);
  } catch (err) {
    console.warn('[posts] curated sync failed:', err);
  }
}
