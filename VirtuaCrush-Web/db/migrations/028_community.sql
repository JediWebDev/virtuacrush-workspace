-- Community sharing (Phase 4): attribution + moderation metadata for public
-- custom content. Visibility/moderation_status already exist (migration 026);
-- this adds the bookkeeping the publish flow and community browse need.
--
-- creator_name      — denormalized display name of the ORIGINAL author, shown
--                     as attribution on community cards and carried onto copies.
-- source_id         — when a row was copied from a public item, the original's id.
-- published_at      — when it last went public (used for "newest" ordering).
-- moderation_reason — why an auto-moderation check rejected a publish attempt.
-- copy_count        — how many times a public item has been copied (popularity).

ALTER TABLE user_characters
  ADD COLUMN IF NOT EXISTS creator_name      TEXT,
  ADD COLUMN IF NOT EXISTS source_id         BIGINT,
  ADD COLUMN IF NOT EXISTS published_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS copy_count        INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_stories
  ADD COLUMN IF NOT EXISTS creator_name      TEXT,
  ADD COLUMN IF NOT EXISTS source_id         BIGINT,
  ADD COLUMN IF NOT EXISTS published_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS copy_count        INTEGER NOT NULL DEFAULT 0;

-- Indexes for the community browse queries (public + approved, newest first).
CREATE INDEX IF NOT EXISTS user_characters_public_idx
  ON user_characters (visibility, moderation_status, published_at DESC);

CREATE INDEX IF NOT EXISTS user_stories_public_idx
  ON user_stories (visibility, moderation_status, format, published_at DESC);
