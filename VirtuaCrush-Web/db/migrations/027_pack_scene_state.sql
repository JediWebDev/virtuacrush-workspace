-- Rolling "scene so far" snapshot for story-pack sessions, mirroring the
-- free-roam director's scene-state continuity. Persists who's present, the
-- location, the player's physical state, and key facts beyond the recent-history
-- window so long pack scenes don't drift.
ALTER TABLE pack_sessions
  ADD COLUMN IF NOT EXISTS scene_state TEXT NOT NULL DEFAULT '';
