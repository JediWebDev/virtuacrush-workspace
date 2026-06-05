-- Records priced mischief incidents during the current date so the end-date bill
-- can be computed deterministically by the simulation engine (not the LLM).
ALTER TABLE character_state
  ADD COLUMN IF NOT EXISTS scene_incidents JSONB NOT NULL DEFAULT '[]'::jsonb;
