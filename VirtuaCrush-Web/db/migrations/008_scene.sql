-- Scene / dating-state for the date loop (mechanic #2 expansion).
--
-- Adds a per-(user,character) scene to character_state:
--   scene_mode     'apart'   = character is at their own place; chatting remotely
--                  'together' = on a date with the user at scene_location
--   scene_location venue slug when together (coffee_shop, restaurant, ...)
--   bill_pending   true while at a paid venue and the bill hasn't been settled
--
-- And a `kind` to each dialogue choice ('date' | 'bill' | 'goal') so the client
-- and server can apply the right behavior.
ALTER TABLE character_state
  ADD COLUMN IF NOT EXISTS scene_mode     TEXT    NOT NULL DEFAULT 'apart',
  ADD COLUMN IF NOT EXISTS scene_location TEXT,
  ADD COLUMN IF NOT EXISTS bill_pending   BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE dialogue_choices
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'date';
