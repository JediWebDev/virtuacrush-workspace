// VIP interest list signups ("notify me when VIP launches"). Stored in
// Postgres; export anytime with:
//   SELECT email, created_at FROM interest_list WHERE source = 'vip_waitlist';
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post('/', requireAuth, async (req: Request, res: Response) => {
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
