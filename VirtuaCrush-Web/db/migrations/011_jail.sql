-- Jail state for the arrest -> jail -> bail -> release loop.
--   jailed_until    when set and in the future, the user is in a holding cell
--   bail_call_used  whether the user has spent their one phone call this stint
ALTER TABLE character_state
  ADD COLUMN IF NOT EXISTS jailed_until   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bail_call_used BOOLEAN NOT NULL DEFAULT false;
