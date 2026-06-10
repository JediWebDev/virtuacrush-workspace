-- Composed opening scene (the engine-authoritative VN "scene header") per
-- user/character. JSONB blob written by server/db/scene_composition.ts;
-- recomposed when the day, phase, or venue changes (or it goes stale).
ALTER TABLE character_state ADD COLUMN IF NOT EXISTS scene_composition JSONB;
