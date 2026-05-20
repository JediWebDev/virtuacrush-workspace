-- RPG-style affinity progression for user–character relationships
-- Run against your PostgreSQL database (e.g. via psql or Railway Postgres shell)

BEGIN;

-- Add progression columns if the affinity table already exists
ALTER TABLE IF EXISTS user_character_affinity
  ADD COLUMN IF NOT EXISTS current_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_xp INTEGER NOT NULL DEFAULT 0;

-- Enforce NOT NULL on existing rows (idempotent when columns were just added with DEFAULT)
ALTER TABLE user_character_affinity
  ALTER COLUMN current_level SET NOT NULL,
  ALTER COLUMN current_level SET DEFAULT 1,
  ALTER COLUMN current_xp SET NOT NULL,
  ALTER COLUMN current_xp SET DEFAULT 0;

-- Optional: prevent invalid progression state
ALTER TABLE user_character_affinity
  DROP CONSTRAINT IF EXISTS user_character_affinity_level_positive,
  ADD CONSTRAINT user_character_affinity_level_positive CHECK (current_level >= 1);

ALTER TABLE user_character_affinity
  DROP CONSTRAINT IF EXISTS user_character_affinity_xp_non_negative,
  ADD CONSTRAINT user_character_affinity_xp_non_negative CHECK (current_xp >= 0);

COMMIT;
