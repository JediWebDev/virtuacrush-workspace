-- Story Studio: user-created characters and stories (arcs/packs).
--
-- Phase 1 uses user_stories (format='arc') for existing characters. The
-- user_characters table is created now as the data-model foundation; the
-- character builder wires it in a later phase. visibility/moderation_status
-- support the public-sharing phase (private content defaults to 'approved').

CREATE TABLE IF NOT EXISTS user_characters (
  id                BIGSERIAL PRIMARY KEY,
  owner_user_id     TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  display_name      TEXT        NOT NULL,
  core              TEXT        NOT NULL,           -- persona/core system prompt
  greeting          TEXT        NOT NULL DEFAULT '',
  secret            TEXT,
  tone              TEXT,
  visibility        TEXT        NOT NULL DEFAULT 'private'
                      CHECK (visibility IN ('private', 'public')),
  moderation_status TEXT        NOT NULL DEFAULT 'approved'
                      CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_characters_owner_idx
  ON user_characters (owner_user_id);

CREATE TABLE IF NOT EXISTS user_stories (
  id                BIGSERIAL PRIMARY KEY,
  owner_user_id     TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- A built-in character id (e.g. 'serena') or 'user:<user_characters.id>'.
  character_id      TEXT        NOT NULL,
  title             TEXT        NOT NULL,
  blurb             TEXT        NOT NULL DEFAULT '',
  format            TEXT        NOT NULL DEFAULT 'arc'
                      CHECK (format IN ('arc', 'pack')),
  -- StoryArc-shaped (format='arc') or StoryPack-shaped (format='pack') object.
  spec              JSONB       NOT NULL,
  visibility        TEXT        NOT NULL DEFAULT 'private'
                      CHECK (visibility IN ('private', 'public')),
  moderation_status TEXT        NOT NULL DEFAULT 'approved'
                      CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_stories_owner_char_idx
  ON user_stories (owner_user_id, character_id);
