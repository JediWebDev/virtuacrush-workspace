-- Emergent (LLM-generated) story arcs.
-- `source` distinguishes player-authored Studio stories ('user') from
-- system-generated emergent arcs ('generated') so the latter stay out of the
-- player's Studio list while still playing through the same user:<id> runtime.
ALTER TABLE user_stories
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user';

-- Per (user, character) cooldown timestamp: when we last ATTEMPTED an emergent
-- arc generation (success or skip), so generation stays steady and cheap.
ALTER TABLE character_state
  ADD COLUMN IF NOT EXISTS last_emergent_arc_at TIMESTAMPTZ;
