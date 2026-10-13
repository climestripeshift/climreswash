SET LOCAL search_path = bhoomi_beta, pg_catalog;
CREATE TABLE IF NOT EXISTS pin_visitors (
  visitor_hash TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE REFERENCES users(email),
  expires_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS pin_sessions (
  session_hash TEXT PRIMARY KEY REFERENCES auth_sessions(hash) ON DELETE CASCADE,
  generation TEXT NOT NULL
);
INSERT INTO settings(key,value) VALUES('shared_pin_enabled','false') ON CONFLICT DO NOTHING;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='bhoomi_beta_runtime') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON bhoomi_beta.pin_visitors,bhoomi_beta.pin_sessions TO bhoomi_beta_runtime;
  END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
