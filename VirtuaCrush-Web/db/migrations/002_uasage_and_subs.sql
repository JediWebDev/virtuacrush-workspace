-- Tracks daily message usage per user for free-tier rate limiting.
-- One row per (user, UTC date). Increment on every user message accepted.
CREATE TABLE IF NOT EXISTS message_usage (
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  usage_date    DATE NOT NULL DEFAULT (CURRENT_DATE AT TIME ZONE 'UTC'),
  message_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS message_usage_user_date_idx
  ON message_usage (user_id, usage_date DESC);

-- Subscription state, kept in sync via Stripe webhooks.
-- We mirror just enough Stripe data to answer "is this user paid right now?"
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT NOT NULL,
  stripe_subscription_id TEXT,
  status                 TEXT NOT NULL,             -- active, trialing, past_due, canceled, incomplete...
  current_period_end     TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_customer_idx
  ON subscriptions (stripe_customer_id);

-- Optional: persist conversation history server-side so chats survive refreshes.
-- If you'd rather keep history client-side (localStorage), drop this table.
CREATE TABLE IF NOT EXISTS chat_messages (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  character_id  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_messages_user_char_idx
  ON chat_messages (user_id, character_id, created_at);