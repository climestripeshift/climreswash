-- OPERATOR TEMPLATE ONLY. Execute only after separate database approval.
-- No passwords are present: set the runtime role's credentials through the provider's secure tools.
-- Run versioned migrations as the administrative/migration role FIRST.
CREATE ROLE bhoomi_beta_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
REVOKE ALL ON SCHEMA bhoomi_beta FROM PUBLIC;
GRANT USAGE ON SCHEMA bhoomi_beta TO bhoomi_beta_runtime;
GRANT SELECT ON bhoomi_beta.schema_migrations TO bhoomi_beta_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON bhoomi_beta.users,bhoomi_beta.interactions,bhoomi_beta.feedback,
  bhoomi_beta.usage,bhoomi_beta.audit,bhoomi_beta.settings,bhoomi_beta.revoked_tokens,
  bhoomi_beta.auth_sessions,bhoomi_beta.login_attempts,bhoomi_beta.request_leases,
  bhoomi_beta.relay_spending,bhoomi_beta.conversations TO bhoomi_beta_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA bhoomi_beta TO bhoomi_beta_runtime;
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO bhoomi_beta_runtime', current_database()); END $$;
-- No grants on public-site tables. Startup checks effective privileges and refuses a broad/owner role.
