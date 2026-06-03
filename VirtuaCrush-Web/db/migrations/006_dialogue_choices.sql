-- Timed dynamic dialogue choices (gamification mechanic #2).
--
-- When the story engine surfaces a branch point, a row is created with two
-- options and a 60s deadline. The client shows a draining hourglass; the server
-- is authoritative on the deadline. On select/timeout the row is resolved.
--
-- `options` is a JSON array of two objects:
--   { "label": "...", "advancesGoal": true|false, "reaction": "...", "post": "..."? }
-- (server-authoritative fields like reaction/advancesGoal are never sent to the
-- client until a choice is made).
CREATE TABLE IF NOT EXISTS dialogue_choices (
  id               BIGSERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  character_id     TEXT NOT NULL,
  prompt           TEXT NOT NULL,
  options          JSONB NOT NULL,
  timeout_reaction TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'chosen', 'timed_out')),
  chosen_index     INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL
);

-- Fast lookup of the active (pending) choice for a user/character.
CREATE INDEX IF NOT EXISTS dialogue_choices_active_idx
  ON dialogue_choices (user_id, character_id, status, created_at DESC);
