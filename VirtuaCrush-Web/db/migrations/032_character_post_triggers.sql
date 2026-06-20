-- One-shot autonomous feed triggers per user/character (contact swap, arc complete, etc.).
CREATE TABLE IF NOT EXISTS character_post_triggers (
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  trigger_key  TEXT NOT NULL,
  fired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, character_id, trigger_key)
);

CREATE INDEX IF NOT EXISTS character_post_triggers_char_idx
  ON character_post_triggers (user_id, character_id, fired_at DESC);
