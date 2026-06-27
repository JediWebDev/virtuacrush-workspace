-- PRO interest list: emails collected from the "notify me" CTA. One row per
-- (email, source) so repeat submissions are no-ops.
CREATE TABLE IF NOT EXISTS interest_list (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'pro_waitlist',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email, source)
);
