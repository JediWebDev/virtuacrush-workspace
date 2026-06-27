-- Unified achievements ledger: arc completions, affinity tiers, secret reveals,
-- and relationship beats. One row per (user, character, ach_key) so re-earning
-- the same milestone is idempotent. Arc completions are ALSO kept in
-- arc_completions (used by selectArc for gating); this table powers the
-- player-facing profile display + sharing.
CREATE TABLE IF NOT EXISTS achievements (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  character_id  TEXT NOT NULL,
  kind          TEXT NOT NULL,          -- 'arc' | 'affinity' | 'secret' | 'beat'
  ach_key       TEXT NOT NULL,          -- dedupe key within (user, character)
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  tone          TEXT,                   -- optional styling hint (arc tone, etc.)
  earned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, character_id, ach_key)
);

CREATE INDEX IF NOT EXISTS achievements_user_idx
  ON achievements (user_id, earned_at DESC);
