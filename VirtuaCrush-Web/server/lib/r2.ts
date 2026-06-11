// Shared Cloudflare R2 (S3 API) client + config. Used by the asset proxy and
// the curated-posts sync job. Values pasted into host dashboards often arrive
// with surrounding quotes or stray whitespace — both are scrubbed here, and a
// one-time startup diagnostic prints the PARSED values (JSON-quoted, with
// lengths) so any invisible character shows up in the logs instead of as an
// opaque InvalidBucketName error.
import { S3Client } from '@aws-sdk/client-s3';

function clean(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
}

export const R2_BUCKET = clean(process.env.R2_BUCKET);

export const R2_ENDPOINT = (() => {
  let ep = clean(process.env.R2_ENDPOINT).replace(/\/+$/, '');
  // Accept the dashboard's bucket-suffixed URL; the SDK wants it WITHOUT.
  if (R2_BUCKET && ep.toLowerCase().endsWith(`/${R2_BUCKET.toLowerCase()}`)) {
    ep = ep.slice(0, -(R2_BUCKET.length + 1));
  }
  return ep;
})();

const KEY_ID = clean(process.env.R2_ACCESS_KEY_ID);
const SECRET = clean(process.env.R2_SECRET_ACCESS_KEY);

export const r2Enabled = Boolean(R2_ENDPOINT && R2_BUCKET && KEY_ID && SECRET);

// --- Startup diagnostics --------------------------------------------------------
if (!r2Enabled) {
  console.warn(
    `[r2] not configured — endpoint:${R2_ENDPOINT ? 'set' : 'MISSING'} bucket:${R2_BUCKET ? 'set' : 'MISSING'} ` +
      `keyId:${KEY_ID ? 'set' : 'MISSING'} secret:${SECRET ? 'set' : 'MISSING'}`,
  );
} else {
  // JSON.stringify exposes quotes/控制 characters that the eye can't see.
  console.log(
    `[r2] configured: endpoint=${JSON.stringify(R2_ENDPOINT)} bucket=${JSON.stringify(R2_BUCKET)} ` +
      `(len ${R2_BUCKET.length}) keyId=${KEY_ID.slice(0, 6)}…(len ${KEY_ID.length}) secret len ${SECRET.length}`,
  );
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(R2_BUCKET)) {
    console.warn(`[r2] WARNING: bucket name ${JSON.stringify(R2_BUCKET)} contains invalid characters (expected e.g. "virtuacrush")`);
  }
  if (!/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(R2_ENDPOINT)) {
    console.warn(
      `[r2] WARNING: endpoint ${JSON.stringify(R2_ENDPOINT)} doesn't look like https://<32-hex-account-id>.r2.cloudflarestorage.com`,
    );
  }
}

export const r2 = r2Enabled
  ? new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: KEY_ID, secretAccessKey: SECRET },
    })
  : null;
