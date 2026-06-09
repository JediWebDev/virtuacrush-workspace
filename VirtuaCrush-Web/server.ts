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

import path from 'node:path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { toNodeHandler } from 'better-auth/node';
import { selectProviderName } from './server/llm';
import { applyMigrations } from './server/db/applyMigrations';

import { auth } from './server/lib/auth';
import chatRouter from './server/routes/chat';
import usageRouter from './server/routes/usage';
import stripeRouter from './server/routes/stripe';
import affinityRouter from './server/routes/affinity';
import memoryRouter from './server/routes/memory';
import stateRouter from './server/routes/state';
import choiceRouter from './server/routes/choice';
import postsRouter from './server/routes/posts';
import dateRouter from './server/routes/date';
import jailRouter from './server/routes/jail';
import profileRouter from './server/routes/profile';
import worldRouter from './server/routes/world';
import desireRouter from './server/routes/desire';

// --- Startup config checks (provider-aware) ---------------------------------
const LLM_PROVIDER = selectProviderName();
if (LLM_PROVIDER === 'inworld' && !process.env.INWORLD_API_KEY?.trim()) {
  console.error('[startup] LLM_PROVIDER=inworld but INWORLD_API_KEY is not set — chat will fail');
}
if (LLM_PROVIDER === 'openai' && !process.env.LLM_API_KEY?.trim()) {
  console.error('[startup] LLM_PROVIDER=openai but LLM_API_KEY is not set — chat will fail');
}
if (!process.env.INWORLD_API_KEY?.trim()) {
  console.warn('[startup] INWORLD_API_KEY unset — long-term memory (embeddings) is disabled; it fails soft');
}
console.log(`[startup] LLM provider: ${LLM_PROVIDER}`);

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
app.use('/api/affinity', affinityRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/state', stateRouter);
app.use('/api/choice', choiceRouter);
app.use('/api/posts', postsRouter);
app.use('/api/date', dateRouter);
app.use('/api/jail', jailRouter);
app.use('/api/profile', profileRouter);
app.use('/api/world', worldRouter);
app.use('/api/desire', desireRouter);

// --- Health check -----------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Static frontend (single-service deploy) --------------------------------
// When SERVE_STATIC is on, Express also serves the built SPA, so the whole app
// runs as ONE Railway service (frontend + API same-origin → no CORS needed,
// simpler session cookies). For a split deploy, leave it off and host the
// frontend separately (then set PUBLIC_APP_URL + SameSite=None cookies).
if (process.env.SERVE_STATIC === 'true' || process.env.SERVE_STATIC === '1') {
  const staticDir = path.resolve(process.env.STATIC_DIR || 'dist/public');
  app.use(express.static(staticDir));
  // SPA fallback: any non-API GET returns index.html so client-side routing works.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
  console.log(`[server] serving static frontend from ${staticDir}`);
}

// --- Start ------------------------------------------------------------------
const HOST = process.env.HOST ?? '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`[server] listening on ${HOST}:${PORT}`);
  // Run DB migrations AFTER binding the port so a slow/unready database can
  // never block startup or fail the healthcheck. Idempotent + non-fatal.
  void applyMigrations().catch((e) => console.error('[migrate] background run failed:', e));
});

// Friendly handling for the common "port already taken" case (usually a stale
// dev server still holding the port — see the shutdown note b