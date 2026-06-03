-- Dynamic social-feed posts (gamification mechanic #2 payoff).
--
-- When a user makes a dialogue choice that advances the character's goal, the
-- character "posts" about it. These per-user posts are merged ahead of the
-- static feed in the UI.
CREATE TABLE IF NOT EXISTS character_posts (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  text         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS character_posts_user_char_idx
  ON character_posts (user_id, character_id, created_at DESC);
