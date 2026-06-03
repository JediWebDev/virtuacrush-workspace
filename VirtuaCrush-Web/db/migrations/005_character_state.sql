-- Per-user emergent story state for each character (the "story engine").
--
-- One row per (user, character) holding the CURRENT day's simulated situation:
-- what they're doing, their mood, a short UI headline, and how far along they
-- are toward their long-term goal. `state_date` marks which day the row is for;
-- when it's older than today the state is regenerated (lazily on read, or by a
-- scheduled batch job — see server/jobs/regenerate-states.ts).
--
-- Per-user (not global) so each player's storyline can diverge over time.
CREATE TABLE IF NOT EXISTS character_state (
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  character_id  TEXT NOT NULL,
  state_date    DATE NOT NULL,
  activity      TEXT NOT NULL,                       -- "grinding the ranked ladder before tonight's stream"
  mood          TEXT NOT NULL,                       -- short, e.g. "wired but focused"
  headline      TEXT NOT NULL,                       -- compact status line for the UI
  goal_progress INTEGER NOT NULL DEFAULT 0
                  CHECK (goal_progress >= 0 AND goal_progress <= 100),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, character_id)
);

CREATE INDEX IF NOT EXISTS character_state_user_idx
  ON character_state (user_id);

-- Helps the batch regeneration job find stale rows quickly.
CREATE INDEX IF NOT EXISTS character_state_stale_idx
  ON character_state (state_date);
