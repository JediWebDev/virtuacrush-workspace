-- Planned (agreed-but-not-yet-arrived) date location, so a date can be arranged
-- while the couple is still apart and sorting out logistics (meet there vs get
-- picked up). Cleared once they're actually together.
ALTER TABLE character_state
  ADD COLUMN IF NOT EXISTS planned_location TEXT;
