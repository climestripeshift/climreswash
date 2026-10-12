CREATE SCHEMA IF NOT EXISTS bhoomi_beta;
SET LOCAL search_path = bhoomi_beta, pg_catalog;
      CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, user_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'invited', invited_at DOUBLE PRECISION NOT NULL, invited_by TEXT, consent_version TEXT, consent_at DOUBLE PRECISION,
        consent_research INTEGER NOT NULL DEFAULT 0, consent_training INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS interactions (id TEXT PRIMARY KEY, user_hash TEXT NOT NULL, ts DOUBLE PRECISION NOT NULL, session_id TEXT,
        question TEXT NOT NULL, answer TEXT NOT NULL, status TEXT, verified INTEGER NOT NULL DEFAULT 0, verification_json TEXT,
        tool_calls_json TEXT, model_json TEXT, latency_s DOUBLE PRECISION, unavailable_json TEXT);
      CREATE TABLE IF NOT EXISTS feedback (id BIGSERIAL PRIMARY KEY, interaction_id TEXT NOT NULL, user_hash TEXT NOT NULL,
        ts DOUBLE PRECISION NOT NULL, rating TEXT, categories_json TEXT NOT NULL, comment TEXT, correction TEXT,
        review_status TEXT NOT NULL DEFAULT 'new', reviewer TEXT, reviewed_at DOUBLE PRECISION, reviewer_notes TEXT);
      CREATE TABLE IF NOT EXISTS usage (user_hash TEXT NOT NULL, day TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
        gpu_seconds DOUBLE PRECISION NOT NULL DEFAULT 0, PRIMARY KEY (user_hash, day));
      CREATE TABLE IF NOT EXISTS audit (id BIGSERIAL PRIMARY KEY, ts DOUBLE PRECISION NOT NULL, actor_hash TEXT, action TEXT NOT NULL, detail TEXT);
      CREATE INDEX IF NOT EXISTS fb_status ON feedback(review_status);
      CREATE INDEX IF NOT EXISTS ix_user ON interactions(user_hash);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revoked_tokens (hash TEXT PRIMARY KEY, expires_at DOUBLE PRECISION NOT NULL);

ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_quota INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS revoked_before DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expires_at DOUBLE PRECISION;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS consent_json TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS feedback_owner ON feedback(interaction_id,user_hash);
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS auth_sessions(hash TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES users(email), issued_at DOUBLE PRECISION NOT NULL, expires_at DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS request_leases(id TEXT PRIMARY KEY, user_hash TEXT NOT NULL, admitted_at DOUBLE PRECISION NOT NULL, expires_at DOUBLE PRECISION NOT NULL, released INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS lease_expiry ON request_leases(expires_at);
CREATE TABLE IF NOT EXISTS relay_spending(id BIGSERIAL PRIMARY KEY, ts DOUBLE PRECISION NOT NULL, reservation_micro_usd BIGINT NOT NULL CHECK(reservation_micro_usd>=0), request_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'reserved');
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
