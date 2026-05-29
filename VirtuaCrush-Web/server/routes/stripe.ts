// Stripe Checkout + webhook handler.
//
// Setup checklist (Stripe dashboard):
//   1. Create a Product + recurring Price (e.g. "VirtuaCrush Premium / $9.99 / mo")
//      and put the price id in STRIPE_PRICE_ID.
//   2. Add a webhook endpoint at https://<your-domain>/api/stripe/webhook
//      and subscribe to:
//        - checkout.session.completed
//        - customer.subscription.created
//        - customer.subscription.updated
//        - customer.subscription.deleted
//      Put the signing secret in STRIPE_WEBHOOK_SECRET.
//   3. Local dev: `stripe listen --forward-to localhost:3001/api/stripe/webhook`
import { Router, raw } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth';
import {
    upsertSubscription,
    getUserIdByStripeCustomer,
} from '../db/subscriptions';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-05-27.dahlia',
});

const router = Router();

// --- Create Checkout Session -------------------------------------------------
router.post('/checkout', requireAuth, async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
            customer_email: req.user!.email,
            // client_reference_id lets us map back to our user when the webhook fires.
            // Avoids needing to pre-create a Stripe customer per user.
            client_reference_id: req.user!.id,
            success_url: `${process.env.PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.PUBLIC_APP_URL}/billing/cancel`,
        });
        res.json({ url: session.url });
    } catch (err) {
        console.error('[stripe] checkout failed:', err);
        res.status(500).json({ error: 'checkout_failed' });
    }
});

// --- Webhook -----------------------------------------------------------------
// IMPORTANT: This route MUST receive the raw body to verify Stripe's signature.
// In server.ts we mount this router BEFORE express.json(), and the route below
// uses express.raw() inline to enforce that.
router.post('/webhook', raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) return res.status(400).send('missing signature');

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET!,
        );
    } catch (err) {
        console.error('[stripe] webhook signature failed:', err);
        return res.status(400).send('invalid signature');
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const userId = session.client_reference_id;
                const customerId = session.customer as string;
                const subscriptionId = session.subscription as string;
                if (!userId || !customerId || !subscriptionId) break;

                // Fetch the subscription with items expanded so we can read the period
                // from the first item (Stripe API 2025-06+ moved period fields onto items).
                const sub = await stripe.subscriptions.retrieve(subscriptionId);
                const periodEnd = sub.items.data[0]?.current_period_end;

                await upsertSubscription({
                    userId,
                    stripeCustomerId: customerId,
                    stripeSubscriptionId: subscriptionId,
                    status: sub.status,
                    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
                });
                break;
            }
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
                const sub = event.data.object as Stripe.Subscription;
                const customerId = sub.customer as string;
                const userId = await getUserIdByStripeCustomer(customerId);
                if (!userId) break;

                // Same pattern: read period from the first item, not the subscription root.
                const periodEnd = sub.items.data[0]?.current_period_end;

                await upsertSubscription({
                    userId,
                    stripeCustomerId: customerId,
                    stripeSubscriptionId: sub.id,
                    status: sub.status,
                    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
                });
                break;
            }

            default:
                // Ignore everything else — keep the handler minimal so failures here
                // don't block the events we actually care about.
                break;
        }
        res.json({ received: true });
    } catch (err) {
        console.error('[stripe] webhook handler error:', err);
        res.status(500).send('webhook handler failed');
    }
});

export default router;