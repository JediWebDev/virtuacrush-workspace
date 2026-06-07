-- Living-world simulation: a per-user world clock, an activity-log (world_events),
-- and the extra mutable NPC state the tick reads/writes (NPC<->NPC relationships,
-- needs, memories). NPC<->player affinity stays in character_affinity; the
-- singular npc_state.relationship column is left as-is for the chat path.
CREATE TABLE IF NOT EXISTS world_clock (
  user_id      TEXT PRIMARY KEY,
  sim_minutes  BIGINT NOT NULL DEFAULT 0,   -- in-world time
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() -- last real time the world advanced
);

CREATE TABLE IF NOT EXISTS world_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  at_min      BIGINT NOT NULL,
  kind        TEXT NOT NULL,
  actors      JSONB NOT NULL DEFAULT '[]'::jsonb,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS world_events_user_idx ON world_events (user_id, id DESC);

ALTER TABLE npc_state ADD COLUMN IF NOT EXISTS relationships JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE npc_state ADD COLUMN IF NOT EXISTS needs         JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE npc_state ADD COLUMN IF NOT EXISTS memories      JSONB NOT NULL DEFAULT '[]'::jsonb;
