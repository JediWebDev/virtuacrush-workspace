-- Story-so-far diary: key beats extracted from chat sessions per
-- user/character (written by the diary sweep job; shown in the profile rail).
CREATE TABLE IF NOT EXISTS chat_diary (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  beat         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_diary_user_char_idx
  ON chat_diary (user_id, character_id, created_at DESC);
