-- Story Arc runtime state: which arc is active, when it started, and how many
-- consecutive abandonment signals have accumulated (debounce counter).
ALTER TABLE character_state
  ADD COLUMN IF NOT EXISTS current_arc_id        TEXT,
  ADD COLUMN IF NOT EXISTS active_arc_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS abandonment_strikes   INTEGER NOT NULL DEFAULT 0;

-- Permanent ledger of completed arcs per user/character. One row per
-- (user, character, arc) — the UNIQUE constraint makes re-runs idempotent.
CREATE TABLE IF NOT EXISTS arc_completions (
  id               BIGSERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  character_id     TEXT NOT NULL,
  arc_id           TEXT NOT NULL,
  badge_title      TEXT NOT NULL,
  badge_description TEXT NOT NULL,
  tone             TEXT NOT NULL,
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, character_id, arc_id)
);

CREATE INDEX IF NOT EXISTS arc_completions_user_char_idx
  ON arc_completions (user_id, character_id);
