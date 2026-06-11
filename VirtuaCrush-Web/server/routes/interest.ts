// VIP interest list signups ("notify me when VIP launches"). PUBLIC — the CTA
// now lives on the unauthenticated landing page. Stored in Postgres; export:
//   SELECT email, created_at FROM interest_list WHERE source = 'vip_waitlist';
import { Router, type Request, type Response } from 'express';
import { pool } from '../db/pool';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Tiny in-memory rate limit (per-process): protects the public endpoint from
// drive-by spam without needing infrastructure.
const hits = new Map<string, { n: number; at: number }>();
function allow(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) {
    hits.set(ip, { n: 1, at: now });
    return true;
  }
  h.n++;
  return h.n <= 5;
}

router.post('/', async (req: Request, res: Response) => {
  if (!allow(req.ip ?? 'unknown')) return res.status(429).json({ error: 'slow_down' });
  const email = String((req.body ?? {}).email ?? '').trim().toLowerCase();
  const source = String((req.body ?? {}).source ?? 'vip_waitlist').slice(0, 40);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  try {
    await pool.query(
      `INSERT INTO interest_list (email, source) VALUES ($1, $2)
       ON CONFLICT (email, source) DO NOTHING`,
      [email, source],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[interest] insert failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
