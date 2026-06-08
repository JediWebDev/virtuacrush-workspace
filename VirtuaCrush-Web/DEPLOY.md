# Deploying Virtua Crush to Railway

The app runs as **one service**: an Express server that serves the built React
frontend *and* the `/api` routes from the same origin, talking to a managed
Postgres database and an LLM provider over HTTPS. No GPU and no native build
step are required when you use the OpenAI-compatible provider (e.g. OpenRouter).

## 1. Provision

1. Create a Railway project from your GitHub repo (Railway auto-detects Node).
2. Add a **Postgres** database plugin to the project. Railway injects
   `DATABASE_URL`. Use the **internal** URL (`*.railway.internal`) for the app
   service — it's free of egress charges and needs no SSL.

## 2. Build & start commands

- **Build:** `npm run build`
  (runs `vite build --outDir dist/public` then bundles the server to
  `dist/server.cjs`)
- **Start:** `npm run start:railway`
  (runs DB migrations, then `node dist/server.cjs`)

If you prefer to keep migrations separate, set the start command to
`npm start` and run `npm run migrate` as a one-off in the Railway shell.

## 3. Environment variables

### Core
| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | (auto from Railway PG) | Use the internal URL. |
| `PGSSL` | `disable` for internal URL, `require` for a public URL | Unset = auto-detect. |
| `PORT` | (auto from Railway) | Express reads it; don't hardcode. |
| `PUBLIC_APP_URL` | `https://<your-app>.up.railway.app` | Used for CORS + OpenRouter referer. |
| `SERVE_STATIC` | `true` | Makes Express serve the SPA (single-service deploy). |
| `STATIC_DIR` | `dist/public` | Default; only set to override. |
| `BETTER_AUTH_SECRET` | a long random string | Required by Better Auth. |

### LLM provider (swappable)
The model is chosen entirely by env — no code change to switch.

**OpenRouter (uncensored, recommended for prod):**
| Var | Value |
|---|---|
| `LLM_PROVIDER` | `openai` |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` |
| `LLM_API_KEY` | your OpenRouter key |
| `LLM_MODEL` | e.g. `cognitivecomputations/dolphin-mixtral-8x22b` |
| `LLM_TEMPERATURE` | `0.85` (optional) |
| `LLM_MAX_TOKENS` | `400` (optional) |

Any OpenAI-compatible endpoint works the same way (OpenAI, Together, Fireworks,
Groq, DeepInfra, a self-hosted vLLM/Ollama box) — just change `LLM_BASE_URL`,
`LLM_API_KEY`, and `LLM_MODEL`. "OpenAI-compatible" is the request *format*, not
the model maker.

**Inworld (current default):**
| Var | Value |
|---|---|
| `LLM_PROVIDER` | `inworld` (or leave unset) |
| `INWORLD_API_KEY` | your Inworld key |
| `INWORLD_MODEL_ID` | e.g. `openai/gpt-4o-mini` (optional) |

### Long-term memory (optional)
Memory uses Inworld embeddings. If `INWORLD_API_KEY` is unset, the
`@inworld/runtime` native addon is never loaded and memory simply turns off
(it fails soft — chat is unaffected). Set `INWORLD_API_KEY` to enable it even
when `LLM_PROVIDER=openai`.

### Stripe (if billing is enabled)
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and any price IDs your code reads.
Point the Stripe webhook at `https://<your-app>.up.railway.app/api/stripe`.

## 4. Auth note (same-origin vs split)
This setup keeps the frontend and API on the **same origin** (`SERVE_STATIC=true`),
so Better Auth's session cookie just works. If you ever split them into two
services/domains, you must set the auth cookie to `SameSite=None; Secure` and
list the frontend origin in CORS — same-origin avoids all of that.

## 5. First deploy checklist
- [ ] Postgres plugin added; `DATABASE_URL` present.
- [ ] `LLM_PROVIDER` + its keys set.
- [ ] `PUBLIC_APP_URL`, `SERVE_STATIC=true`, `BETTER_AUTH_SECRET` set.
- [ ] Build = `npm run build`, Start = `npm run start:railway`.
- [ ] Visit `/api/health` → `{ "ok": true }`.
