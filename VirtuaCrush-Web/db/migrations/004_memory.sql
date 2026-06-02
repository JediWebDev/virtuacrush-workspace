-- Long-term memory for RAG retrieval.
--
-- Each row is one durable fact learned about a user (their name, job, pets,
-- life moments, preferences, etc.), captured by an LLM extraction pass after
-- chat turns and stored alongside its embedding vector.
--
-- Facts are scoped to the USER, not the character: in a companion app the user
-- is one person, so every character should be able to recall "your name is
-- Andrew" or "you just adopted a dog." `source_character_id` records which
-- character the fact was learned from, so retrieval can be character-scoped
-- later if desired.
--
-- The embedding is stored as JSONB (a JSON array of floats) rather than a
-- pgvector column so this runs on any vanilla Postgres with no extension.
-- Per-user fact counts are small (tens to low hundreds), so cosine similarity
-- is computed in the application layer. To scale to many thousands of facts,
-- swap `embedding JSONB` for `vector(N)` + an ivfflat index and move the
-- similarity search into SQL.
CREATE TABLE IF NOT EXISTS user_memory (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  source_character_id TEXT,
  fact                TEXT NOT NULL,
  embedding           JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent storing the same fact twice for a user (case-insensitive).
  UNIQUE (user_id, fact)
);

CREATE INDEX IF NOT EXISTS user_memory_user_idx
  ON user_memory (user_id);
