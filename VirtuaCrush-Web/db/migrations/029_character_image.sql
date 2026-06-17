-- Custom-character avatars (image generation + upload).
-- image_key is an R2 object key served via /api/assets/<key>; null = fall back
-- to the generated initials avatar on the client.
ALTER TABLE user_characters
  ADD COLUMN IF NOT EXISTS image_key TEXT;
