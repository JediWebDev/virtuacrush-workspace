import { pool } from './pool';

export interface SubscriptionRow {
  status: string;
  current_period_end: Date | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

export interface SubscriptionDetails {
  subscribed: boolean;
  plan: 'free' | 'pro';
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paused: boolean;
  stripeManaged: boolean;
}

/**
 * Returns true if the user has an active or trialing subscription
 * that hasn't expired. This is the single source of truth for "is paid".
 */
export async function isSubscribed(userId: string): Promise<boolean> {
  const { rows } = await pool.query<SubscriptionRow>(
    `SELECT status, current_period_end, stripe_subscription_id, stripe_customer_id FROM subscriptions WHERE user_id = $1`,
    [userId],
  );
  const sub = rows[0];
  if (!sub) return false;

  const activeStatuses = new Set(['active', 'trialing']);
  if (!activeStatuses.has(sub.status)) return false;

  // Admin/manual grants may omit period end; Stripe subs always set it.
  if (!sub.current_period_end) return true;
  return sub.current_period_end.getTime() > Date.now();
}

export async function getSubscriptionRow(userId: string): Promise<SubscriptionRow | null> {
  const { rows } = await pool.query<SubscriptionRow>(
    `SELECT status, current_period_end, stripe_subscription_id, stripe_customer_id FROM subscriptions WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function upsertSubscription(row: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
}) {
  await pool.query(
    `INSERT INTO subscriptions
       (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       stripe_customer_id     = EXCLUDED.stripe_customer_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       status                 = EXCLUDED.status,
       current_period_end     = EXCLUDED.current_period_end,
       updated_at             = NOW()`,
    [
      row.userId,
      row.stripeCustomerId,
      row.stripeSubscriptionId,
      row.status,
      row.currentPeriodEnd,
    ],
  );
}

/** Look up the local user id by the Stripe customer id (for webhook handlers). */
export async function getUserIdByStripeCustomer(customerId: string): Promise<string | null> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1`,
    [customerId],
  );
  return rows[0]?.user_id ?? null;
}