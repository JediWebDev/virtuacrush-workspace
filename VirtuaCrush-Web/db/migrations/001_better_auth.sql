-- Better Auth's required schema, using the camelCase column names its Kysely
-- adapter expects (emailVerified, createdAt, userId, accountId, ...). Quoted so
-- Postgres preserves the case. Migration 016 remains as an idempotent safety
-- net for databases originally created with the old snake_case version.
CREATE TABLE IF NOT EXISTS "user" (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  name            TEXT,
  image           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  id           TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  token        TEXT NOT NULL UNIQUE,
  "ipAddress"  TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "account" (
  id                       TEXT PRIMARY KEY,
  "userId"                 TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accountId"              TEXT NOT NULL,
  "providerId"             TEXT NOT NULL,
  "accessToken"            TEXT,
  "refreshToken"           TEXT,
  "accessTokenExpiresAt"   TIMESTAMPTZ,
  "refreshTokenExpiresAt"  TIMESTAMPTZ,
  scope                    TEXT,
  "idToken"                TEXT,
  password                 TEXT,  -- bcrypt hash for email/password auth
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("providerId", "accountId")
);

CREATE TABLE IF NOT EXISTS "verification" (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session"("userId");
CREATE INDEX IF NOT EXISTS account_user_id_idx ON "account"("userId");
