// Enforces the free-tier daily message cap. Subscribed users bypass entirely.
// Only checks the quota here; the actual increment happens AFTER a successful
// LLM stream in routes/chat.ts, so failed requests don't burn a credit.
import type { Request, Response, NextFunction } from 'express';
import { isSubscribed } from '../db/subscriptions';
import { getTodayUsage, FREE_TIER_DAILY_LIMIT } from '../db/usage';

export async function enforceMessageQuota(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });

  // Paid users: unlimited, skip the check entirely.
  if (await isSubscribed(req.user.id)) {
    return next();
  }

  const used = await getTodayUsage(req.user.id);
  if (used >= FREE_TIER_DAILY_LIMIT) {
    return res.status(402).json({
      error: 'quota_exceeded',
      limit: FREE_TIER_DAILY_LIMIT,
      used,
      upgrade_url: '/api/stripe/checkout',
    });
  }

  next();
}