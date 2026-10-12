SET LOCAL search_path = bhoomi_beta, pg_catalog;
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, user_hash TEXT NOT NULL, state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS conversation_owner ON conversations(user_hash);
INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
