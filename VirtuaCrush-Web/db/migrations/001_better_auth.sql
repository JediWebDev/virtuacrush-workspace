-- Better Auth's required schema. If you already have a `users` table from
-- your custom auth, you have two choices:
--   A) Rename your old table (users -> users_legacy), run this migration,
--      then write a one-time copy script to migrate rows over.
--   B) Drop the old users table if it's empty / test data only.
-- These DDLs follow Better Auth's default naming.

CREATE TABLE IF NOT EXISTS "user" (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  name            TEXT,
  image           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  token        TEXT NOT NULL UNIQUE,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "account" (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  account_id               TEXT NOT NULL,
  provider_id              TEXT NOT NULL,
  access_token             TEXT,
  refresh_token            TEXT,
  access_token_expires_at  TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope                    TEXT,
  id_token                 TEXT,
  password                 TEXT,  -- bcrypt hash for email/password auth
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, account_id)
);

CREATE TABLE IF NOT EXISTS "verification" (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session"(user_id);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON "account"(user_id);