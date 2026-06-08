-- Better Auth's Kysely adapter expects camelCase column names (emailVerified,
-- createdAt, userId, accountId, ...). The original 001 migration created them in
-- snake_case, so user creation failed with: column "emailVerified" does not exist.
--
-- This renames each snake_case column to the quoted camelCase name Better Auth
-- expects. It is idempotent: each rename runs only if the old column still
-- exists and the new one does not, so re-running the migration is safe.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('user',         'email_verified',           'emailVerified'),
      ('user',         'created_at',               'createdAt'),
      ('user',         'updated_at',               'updatedAt'),
      ('session',      'user_id',                  'userId'),
      ('session',      'expires_at',               'expiresAt'),
      ('session',      'ip_address',               'ipAddress'),
      ('session',      'user_agent',               'userAgent'),
      ('session',      'created_at',               'createdAt'),
      ('session',      'updated_at',               'updatedAt'),
      ('account',      'user_id',                  'userId'),
      ('account',      'account_id',               'accountId'),
      ('account',      'provider_id',              'providerId'),
      ('account',      'access_token',             'accessToken'),
      ('account',      'refresh_token',            'refreshToken'),
      ('account',      'access_token_expires_at',  'accessTokenExpiresAt'),
      ('account',      'refresh_token_expires_at', 'refreshTokenExpiresAt'),
      ('account',      'id_token',                 'idToken'),
      ('account',      'created_at',               'createdAt'),
      ('account',      'updated_at',               'updatedAt'),
      ('verification', 'expires_at',               'expiresAt'),
      ('verification', 'created_at',               'createdAt'),
      ('verification', 'updated_at',               'updatedAt')
    ) AS t(tbl, oldcol, newcol)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.oldcol
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.newcol
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.tbl, r.oldcol, r.newcol);
    END IF;
  END LOOP;
END $$;
