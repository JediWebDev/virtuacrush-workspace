-- Remove dead date/bill system columns from character_state.
-- The date loop was removed; these columns have been inert since then:
--   scene_mode    always 'apart'  (nothing ever sets 'together')
--   bill_pending  always false    (bill system removed)
--   scene_incidents always []     (appendIncident gated on dead onDate path)
ALTER TABLE character_state
  DROP COLUMN IF EXISTS scene_mode,
  DROP COLUMN IF EXISTS bill_pending,
  DROP COLUMN IF EXISTS scene_incidents;
