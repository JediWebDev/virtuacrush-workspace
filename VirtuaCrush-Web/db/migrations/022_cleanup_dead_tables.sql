-- Removes tables and columns that belong to removed mechanics and the abandoned
-- ElizaOS integration. All statements are IF EXISTS so re-running is safe.

-- dialogue_choices: the "timed date choices" gamification mechanic (removed).
-- No server code reads or writes this table; it was only listed in db/reset.ts.
DROP TABLE IF EXISTS dialogue_choices;

-- Dead columns on character_state added by removed mechanics:
--   planned_location  (migration 010) — "arrange a date while apart" flow, removed
--   jailed_until      (migration 011) — jail mechanic, removed
--   bail_call_used    (migration 011) — jail mechanic, removed
ALTER TABLE character_state
  DROP COLUMN IF EXISTS planned_location,
  DROP COLUMN IF EXISTS jailed_until,
  DROP COLUMN IF EXISTS bail_call_used;

-- Legacy ElizaOS tables — the old agent framework was abandoned before launch.
-- These were never created by this migration system and have no server references.
-- CASCADE handles any foreign keys between the eliza tables.
DROP TABLE IF EXISTS agents      CASCADE;
DROP TABLE IF EXISTS entities    CASCADE;
DROP TABLE IF EXISTS rooms       CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS memories    CASCADE;
DROP TABLE IF EXISTS relationships CASCADE;
DROP TABLE IF EXISTS goals       CASCADE;
DROP TABLE IF EXISTS logs        CASCADE;
DROP TABLE IF EXISTS cache       CASCADE;
