-- The player as a first-class entity: permanent identity + current presentation,
-- with a dedicated inventory_items table (owner_type lets NPCs share it later).
-- Worn state is kept in the profile (presentation), NOT as a flag on items, so
-- "owned" and "currently wearing" stay cleanly separate.
CREATE TABLE IF NOT EXISTS player_profiles (
  user_id        TEXT PRIMARY KEY,
  display_name   TEXT NOT NULL DEFAULT '',
  appearance     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- PermanentAppearance
  biography      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- Biography
  grooming       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- Grooming
  worn_item_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- currently wearing
  presets        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- OutfitPreset[]
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  owner_type  TEXT NOT NULL DEFAULT 'player',  -- 'player' | 'npc'
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'other',
  rarity      TEXT,
  style_tags  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_items_owner_idx ON inventory_items (owner_type, owner_id);
