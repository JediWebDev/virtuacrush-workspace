-- VirtuaCrush PostgreSQL schema (Railway deployment)
-- Run against a fresh database: psql $DATABASE_URL -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  tier          VARCHAR(50)  NOT NULL DEFAULT 'free'
                CHECK (tier IN ('free', 'pro', 'vip')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_tier ON users (tier);

-- ---------------------------------------------------------------------------
-- User ↔ character affinity progress
-- ---------------------------------------------------------------------------

CREATE TABLE user_character_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  character_id    VARCHAR(100) NOT NULL,
  affinity_score  INTEGER      NOT NULL DEFAULT 0,
  last_chatted_at TIMESTAMPTZ,
  UNIQUE (user_id, character_id)
);

CREATE INDEX idx_user_character_progress_user_id ON user_character_progress (user_id);
CREATE INDEX idx_user_character_progress_character_id ON user_character_progress (character_id);

-- ---------------------------------------------------------------------------
-- Auto-update users.updated_at on row modification
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE PROCEDURE set_updated_at();
