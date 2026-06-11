-- Curated feed posts synced from the R2 bucket by the posts job.
--   - user_id becomes nullable: NULL = global post visible to every user
--   - image_url: the /api/assets/<key> URL for the post image
--   - source_key: the R2 object key, unique so re-syncs are idempotent
ALTER TABLE character_posts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE character_posts ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE character_posts ADD COLUMN IF NOT EXISTS source_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS character_posts_source_key_idx
  ON character_posts (source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS character_posts_global_idx
  ON character_posts (character_id, created_at DESC) WHERE user_id IS NULL;
