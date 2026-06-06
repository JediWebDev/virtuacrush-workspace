-- Per-user mutable NPC state: the parts of an NPC entity that differ per player
-- (their relationship toward this player, what they know, current outfit, mood,
-- location). The static identity (goals, fashion prefs, faction) is seeded in
-- code (server/sim/roster.ts). Affinity stays in character_affinity; the long-
-- term love/resentment + knowledge live here.
CREATE TABLE IF NOT EXISTS npc_state (
  user_id        TEXT NOT NULL,
  npc_id         TEXT NOT NULL,
  mood           TEXT NOT NULL DEFAULT 'neutral',
  location       TEXT NOT NULL DEFAULT 'home',
  current_outfit JSONB NOT NULL DEFAULT '[]'::jsonb,  -- worn item ids
  relationship   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { trust, love, resentment, tags }
  knowledge      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { beliefs, knownPlayerFacts, lastSeenOutfit, rumors, knownLocations }
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, npc_id)
);
