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
import postsRouter from './server/routes/posts';
import profileRouter from './server/routes/profile';
import worldRouter from './server/routes/world';
import desireRouter from './server/routes/desire';
import assetsRouter from './server/routes/assets';
import diaryRouter from './server/routes/diary';
import travelRouter from './server/routes/travel';
import packsRouter from './server/routes/packs';
import studioRouter from './server/routes/studio';
import communityRouter from './server/routes/community';
import { syncCuratedPosts } from './server/jobs/curated_posts';
import { summarizePendingDiaries } from './server/db/diary';

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
app.use('/api/posts', postsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/world', worldRouter);
app.use('/api/desire', desireRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/diary', diaryRouter);
app.use('/api/travel', travelRouter);
app.use('/api/packs', packsRouter);
app.use('/api/studio', studioRouter);
app.use('/api/community', communityRouter);

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
const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

// Friendly handling for the common "port already taken" case (usually a stale
// dev server still holding the port — see the shutdown note below).
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[server] port ${PORT} is already in use — another instance is probably ` +
        `still running. Stop it (Windows: \`npx kill-port ${PORT}\`, or find the ` +
        `PID with \`netstat -ano | findstr :${PORT}\` then \`taskkill /PID <pid> /F\`) ` +
        `or set PORT to a free port.`,
    );
    process.exit(1);
  }
  throw err;
});

// Graceful shutdown.
//
// The @inworld/runtime addon registers its OWN SIGINT/SIGTERM/exit listeners
// that close its native thread pool but never call process.exit(). Because
// registering any SIGINT listener suppresses Node's default "terminate on
// Ctrl+C" behavior, the process would otherwise linger after Ctrl+C with a
// closed thread pool — a zombie that keeps holding the port (EADDRINUSE on the
// next start) and fails every chat request with "Thread pool is closed".
// We register our own handlers that actually exit so the process really dies.
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received — shutting down`);
  server.close(() => process.exit(0));
  // Don't hang forever if a connection refuses to drain (e.g. open SSE stream).
  setTimeout(() => process.exit(0), 5_000).unref();
};
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

// --- Startup tasks ----------------------------------------------------------
applyMigrations().catch((e) => console.error('[startup] migrations failed:', e));
syncCuratedPosts().catch((e) => console.warn('[curated_posts] initial sync failed:', e));
summarizePendingDiaries().catch((e) => console.warn('[diary] initial summarize failed:', e));
