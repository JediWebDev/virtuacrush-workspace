-- Story pack sessions: tracks an active CYOA pack thread per (user, character).
-- Each session gets its own message thread via pack_session_id on chat_messages.

CREATE TABLE IF NOT EXISTS pack_sessions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  character_id  TEXT        NOT NULL,
  pack_id       TEXT        NOT NULL,
  current_node  TEXT        NOT NULL DEFAULT 'start',
  status        TEXT        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'abandoned')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pack_sessions_user_char_idx
  ON pack_sessions (user_id, character_id, status);

-- Add pack_session_id to chat_messages to scope messages to a pack thread.
-- NULL = free-roam thread (existing behaviour unchanged).
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS pack_session_id BIGINT NULL
    REFERENCES pack_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS chat_messages_pack_session_idx
  ON chat_messages (pack_session_id)
  WHERE pack_session_id IS NOT NULL;
