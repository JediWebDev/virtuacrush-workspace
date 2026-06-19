-- Structured scene snapshot for pack sessions (mirrors npc_state.knowledge.sceneSnapshot).
ALTER TABLE pack_sessions
  ADD COLUMN IF NOT EXISTS scene_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
