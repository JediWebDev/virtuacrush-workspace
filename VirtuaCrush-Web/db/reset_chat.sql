-- Dev reset: wipe conversation state for a clean slate (greetings will fire
-- again, affinity resets to 0, long-term memory is cleared).
--
-- Leaves auth/user/subscription/usage tables intact so you stay logged in.
--
-- Run everything:   npm run db:reset
-- Or a single user: psql $DATABASE_URL -v uid="'YOUR_USER_ID'" -f db/reset_chat.sql
--                   (the per-user DELETEs below use :uid when provided)

-- Wipe all conversation data (default).
TRUNCATE TABLE chat_messages, character_affinity, user_memory RESTART IDENTITY;

-- --- Per-user alternative -------------------------------------------------
-- Comment out the TRUNCATE above and uncomment these to clear only one user:
-- DELETE FROM chat_messages    WHERE user_id = :uid;
-- DELETE FROM character_affinity WHERE user_id = :uid;
-- DELETE FROM user_memory      WHERE user_id = :uid;
