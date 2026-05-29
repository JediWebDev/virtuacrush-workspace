// GET /api/usage — frontend polls this on load + after each message to
// keep the "X of 5 messages left" indicator in sync.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getTodayUsage, FREE_TIER_DAILY_LIMIT } from '../db/usage';
import { isSubscribed } from '../db/subscriptions';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const subscribed = await isSubscribed(req.user!.id);

  // Paid users: explicit null limit/remaining so the UI can branch cleanly.
  if (subscribed) {
    return res.json({ subscribed: true, used: 0, limit: null, remaining: null });
  }

  const used = await getTodayUsage(req.user!.id);
  return res.json({
    subscribed: false,
    used,
    limit: FREE_TIER_DAILY_LIMIT,
    remaining: Math.max(0, FREE_TIER_DAILY_LIMIT - used),
  });
});

export default router;