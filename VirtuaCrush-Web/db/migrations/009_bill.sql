-- Itemized bill payload for "End date" bill choices (mechanic #2 expansion).
-- Stored on the choice row so the client can render the breakdown and the
-- amounts are server-authoritative.
ALTER TABLE dialogue_choices
  ADD COLUMN IF NOT EXISTS bill JSONB;
