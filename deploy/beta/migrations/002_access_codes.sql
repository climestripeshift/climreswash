SET LOCAL search_path = bhoomi_beta, pg_catalog;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_code_hash TEXT;
CREATE TABLE IF NOT EXISTS login_attempts(id BIGSERIAL PRIMARY KEY, email_hash TEXT NOT NULL, ts DOUBLE PRECISION NOT NULL);
CREATE INDEX IF NOT EXISTS login_attempt_window ON login_attempts(ts);
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
