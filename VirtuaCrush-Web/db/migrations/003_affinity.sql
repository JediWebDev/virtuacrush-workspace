-- Tracks per-user affinity score for each character.
-- Score is a decimal so fractional increments (e.g. +0.2/msg) accumulate correctly.
CREATE TABLE IF NOT EXISTS character_affinity (
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  character_id  TEXT NOT NULL,
  score         NUMERIC(6,2) NOT NULL DEFAULT 0
                  CHECK (score >= 0 AND score <= 100),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, character_id)
);

CREATE INDEX IF NOT EXISTS character_affinity_user_idx
  ON character_affinity (user_id);
