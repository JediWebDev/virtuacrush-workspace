// Express entrypoint.
//
// IMPORTANT mount order:
//   1. dotenv/config (must be the very first import)
//   2. CORS + cookie parser
//   3. Stripe webhook (RAW body) — MUST be before express.json()
//   4. express.json() for everything else
//   5. Better Auth catch-all handler
//   6. Application API routes
//   7. Health check
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { toNodeHandler } from 'better-auth/node';

import { auth } from './server/lib/auth';
import chatRouter from './server/routes/chat';
import usageRouter from './server/routes/usage';
import stripeRouter from './server/routes/stripe';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// --- CORS --------------------------------------------------------------------
// `credentials: true` is required so the browser sends Better Auth's session
// cookie on cross-origin requests. The origin must be an explicit URL, not '*'.
app.use(
  cors({
    origin: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',
    credentials: true,
  }),
);

app.use(cookieParser());

// --- Stripe webhook ---------------------------------------------------------
// Mounted BEFORE express.json() because the webhook handler needs the raw
// request body to verify Stripe's signature. The /checkout endpoint inside
// this router uses JSON; that route's body is parsed by Stripe's SDK directly
// from query params + the auth middleware, so this ordering is safe.
app.use('/api/stripe', stripeRouter);

// --- Body parsing for everything else ---------------------------------------
app.use(express.json({ limit: '1mb' }));

// --- Better Auth ------------------------------------------------------------
// Catch-all that handles /api/auth/sign-in, /sign-up, /session, callbacks, etc.
app.all('/api/auth/*', toNodeHandler(auth));

// --- Application API --------------------------------------------------------
app.use('/api/chat', chatRouter);
app.use('/api/usage', usageRouter);

// --- Health check -----------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Start ------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});