# Bhoomi beta: historical Replit integration assessment

**Superseded for authentication and persistence by `BHOOMI_BETA_ACCESS_GUIDE.md`. The current local beta uses private email/access-code sessions and PostgreSQL. Auth0/Cloudflare setup is not required. The provider discussion below records the earlier proposal only.**

12 October 2026. Baseline: `f905bd3` and `2d0eaea`. **Planning/read-only inspection only; not a launch authorization.** This document supersedes the earlier Cloudflare-first recommendation. Keep the existing React frontend, Replit public deployment, domain and BigRock DNS.

## Confirmed findings

- Owner confirms the published deployment is **Autoscale**. Maximum servers, machine size, production runtime, secret names and database/backup plan still need dashboard inspection.
- `.replit`: Node 20, Python 3.11 and PostgreSQL 16 modules; build `npm run build`; run `npm run start`; port 5000. PostgreSQL module presence does not prove a managed production database exists.
- Build creates the existing Vite frontend and `dist/index.cjs`. Start sets `NODE_ENV=production` and starts only `server/index.ts`, listening on `0.0.0.0:$PORT`. It does not start the gateway, Core, relay or development Flask workflow. Do not mistake Run-button workflows for publishing commands.
- Read-only HTTPS checks: `/api/countries` returns 200 JSON (backend demonstrably running); `/bhoomiai`, `/bhoomiai/admin`, **and `/bhoomiai/api/me`** return the 1,985-byte HTML shell. The live beta API is not the committed fail-closed proxy yet. A successful deep-link response is not authentication evidence.
- Existing React routes and early Express beta proxy are reusable. With the committed proxy and no gateway URL, beta APIs return 503. The proxy currently permits only a loopback HTTP upstream.
- Gateway is Cloudflare-only, Node 24 `node:sqlite`, single process. No email OTP login/callback implementation exists for a non-Cloudflare provider. Its existing crypto checks are reusable but not a plug-and-play generic OIDC integration.
- Public app already uses a Neon-compatible PostgreSQL client and `DATABASE_URL`; existing username/password sessions do not prove verified email and must not authenticate beta users. Never change the public database/schema or public session behavior incidentally.

## Proposed architecture, requiring local adaptation first

Keep the public Replit Autoscale app and its usual publishing workflow. Serve the same React pages at `/bhoomiai` and `/bhoomiai/admin`; forward only `/bhoomiai/api/*` through its Express proxy. No Cloudflare Worker, domain migration or second frontend is required.

For this small pilot, keep **one beta backend instance** (the existing gateway/Core/relay package) on a separately approved CPU deployment, potentially a Replit Reserved VM after runtime/dependency suitability is checked. This is a backend service, not another participant website. Add an exact fixed HTTPS upstream option to the proxy; inject its origin secret server-side, never accept that secret from browser headers. Backend ingress must require the origin secret plus the authenticated participant identity. Expose no Core/relay/debug/data ports. Do not merely change the current loopback URL to HTTPS: validation, identity transport and tests need implementation.

An alternative is supervising beta processes inside every public Autoscale instance. It requires Node/runtime changes, Python dependencies, shared quota/concurrency/session coordination and isolation from public-site failures. It is not the lowest-impact option for preserving the current site. Do not switch the public website to Reserved VM just to host this beta.

Use managed PostgreSQL for beta durable state, preferably the existing production provider **with an isolated beta database/schema and least-privilege account**, only after its actual service/region/backup policy is confirmed. A separate managed database is also possible. Preserve the SQLite implementation for local tests; implement a PostgreSQL store behind the existing store contract rather than rebuilding the gateway. Node 24 SQLite cannot be deployed unchanged on the declared Node 20 runtime. Reserved VM alone does not establish durable filesystem guarantees.

Maintain one authoritative backend limiter initially. Port persistent admission/usage/kill/revocation records to transactions with locking; fail closed on database failure. In-memory session-to-worker mappings currently vanish on restart: persist ownership and define a safe new-session response after restart, or reconstruct approved context. Never reuse an unowned session. Relay budget state also needs durable database support; leaving its SQLite file on an ephemeral runtime is insufficient.

## Authentication recommendation and required changes

**Auth0 hosted email OTP, regular web application using Authorization Code flow**, is the closest match to existing RS256/JWKS checks. Use provider-hosted login and its default tenant hostname, so no authentication-domain DNS change is needed. Supabase email OTP plus PostgreSQL is an alternative, but its current signing-key/claim integration also requires explicit adapter work; do not label either provider supported before tests pass.

Required local work:

1. Add provider-specific exact issuer/JWKS/audience configuration and an allowlist of algorithms (RS256 for the selected Auth0 configuration). Do not make the current Cloudflare team-domain parser accept arbitrary hosts or token-controlled JWKS URLs.
2. Add beta-only login/callback/logout routes, Authorization Code state, PKCE and nonce checks; verify signed ID token and `email_verified=true`. Bind provider subject to verified normalized email. Do not accept an email field, `X-User-Email`, Cloudflare header, unsigned JWT or arbitrary audience as proof.
3. Use an opaque, server-side, revocable session in PostgreSQL; cookie Secure/HttpOnly/SameSite=Lax, beta-scoped path. Clear login state after callback and validate return paths. Same-origin write/CSRF protections remain required. Never store privileged tokens in browser localStorage.
4. Replit proxy strips incoming identity/origin-secret headers. Forward participant proof through a deliberately authenticated server-to-server scheme; gateway independently validates it and checks current allowlist/role/revocation on each request. Check both custom domain and direct `.replit.app` origin. A cookie restricted to the custom hostname must not make the direct origin an authorization bypass.
5. Only login-start/callback and minimal sign-in shell are accessible before authentication. All chat, history, feedback, management, export, unknown streaming/tool API paths require authentication first. Admin role remains application-database controlled. The existing design denies streaming/arbitrary tool endpoints; it does not provide a streaming feature.
6. Test real OTP delivery, unverified email denial, expired/forged/wrong-issuer/audience tokens, replay, logout, immediate revocation, cross-user history, direct backend and direct Replit origin. Existing 30 tests cover Cloudflare mode, not this new provider.

Auth0 dashboard after approval: create a Regular Web Application; configure callback `https://climreswash.in/bhoomiai/api/auth/callback`, logout return `https://climreswash.in/bhoomiai`, and only the exact production origin. Enable Email under Authentication → Passwordless for this application and configure expiry/rate limits. Verify current Universal Login/passwordless settings and plan entitlement. Its built-in email service is for testing; use an approved SMTP service for the pilot. Sending-domain SPF/DKIM changes, if needed, require separate DNS approval; no nameserver migration is required. Do not enable a public beta merely because provider signup succeeds: database allowlisting remains decisive.

## Environment names and separation

Existing public settings: `PORT`, `NODE_ENV`, `DATABASE_URL`, `SESSION_SECRET`, optionally existing `ML_SERVICE_URL`. Inspect names/configuration in Publishing without displaying values. Keep them unchanged.

**Proposed names, NOT supported/configured yet:** `BETA_AUTH_PROVIDER`, `BETA_OIDC_ISSUER`, `BETA_OIDC_CLIENT_ID`, `BETA_OIDC_CLIENT_SECRET`, `BETA_OIDC_JWKS_URL`, `BETA_OIDC_REDIRECT_URI`, `BETA_DATABASE_URL`, `BETA_SESSION_KEY`, and HTTPS support for `BHOOMI_BETA_GATEWAY_URL`. Production startup must reject incomplete configurations. Provider client secret belongs only in the process doing code exchange.

Existing beta names to retain where applicable: `BETA_PUBLIC_ORIGIN`, `BETA_HASH_KEY`, `BETA_OPERATOR_ID`, `BETA_ORIGIN_KEY`, `BETA_CORE_URL`, `BETA_PORT`, `BETA_CLOUD_APPROVED` (initially `0`), `BETA_APPROVAL_MANIFEST`, `BETA_LIMIT_PER_MINUTE`, `BETA_LIMIT_PER_HOUR`, `BETA_LIMIT_PER_DAY`, `BETA_LIMIT_GLOBAL_PER_DAY`, `BETA_GLOBAL_CONCURRENT`, `BETA_REQUEST_TIMEOUT_MS`, `BETA_DAILY_GPU_SECONDS`, `BETA_MONTHLY_GPU_SECONDS`, `BETA_RESERVATION_SECONDS`.

Core/relay only: `BHOOMI_DEPLOYMENT_PROFILE=cloud_beta`, `BHOOMI_LLM_BACKEND=openai_compat`, `BHOOMI_LLM_EXPERIMENTAL=1`, `BHOOMI_LLM_MODEL_ID`, `BHOOMI_LLM_REGISTRY`, `BHOOMI_LLM_MODEL`, `BHOOMI_LLM_BASE_URL`, `RELAY_UPSTREAM`, `RELAY_MODEL`, `RUNPOD_API_KEY`, `RELAY_APPROVAL_FILE`, `RELAY_BILLING_FILE`, relay caps/timeouts. Experimental Core receives its existing research process environment; public Express remains production. Do not set the whole public app to research or flip registry `deployable`.

Secrets belong in the appropriate **production** deployment's Secrets, not just the development workspace. No `VITE_*` secret, keys in prompts, CLI argument values or committed operational approvals. Backend receives Runpod credentials; frontend never does. Actual approval/receipt/billing files need secure provisioning, not ephemeral repository files.

## Database migration and recovery requirements — not implemented yet

No PostgreSQL beta migration is delivered by the existing commits. Before launch, supply versioned additive migrations for users, sessions/revocations, consent snapshots, interactions, feedback/review, audit, usage/reservations, pause and relay spending. Use isolated permissions, schema-version tracking and transactionally applied changes. Do not run the existing broad `npm run db:push` against production as a substitute.

Before applying migrations: pause beta only; create a provider snapshot plus encrypted database export using credentials from a secret environment; record release/schema/hash-key identity. Rehearse restore into an isolated database, validate row counts/ownership/consent/quota totals, keep restored beta paused, invalidate active sessions, then reconnect it only after review. Preserve reservations and revocations; never reset budget tables to recover capacity. Back up the HMAC key separately. Forward-compatible schema rollback is preferable to destructive down-migrations. Managed provider retention/PITR eligibility and recovery duration must be checked in its dashboard.

## Operator release guide — after local blockers and approvals are complete

1. Codex produces a reviewed release commit and passes public-route, beta authentication, database, Core and security tests. Current checkout has unrelated work: do not use `git add .`, upload the whole repo, or publish it blindly.
2. In VS Code's terminal, inspect `git status` and the release commit. When separately authorized to push, use `git push origin main` only if main contains exactly the approved release. If Replit tracks another branch, use that reviewed branch instead; confirm tracking first. This inspection did not push.
3. In the existing Replit app, open Git. Confirm the same repository/branch; inspect pending workspace edits. Resolve or safely preserve them before pulling; never force/reset to discard changes. Shell alternative: `git fetch origin`, `git status`, then `git pull --ff-only origin main`. Stop if it is not a fast-forward. Compare `git rev-parse HEAD` with the approved commit.
4. Install locked dependencies and run the release tests in development. Verify previews of public homepage, GIS maps, methodology, simulator and existing login. Build `npm run build`; published run command remains `npm run start`. Pulling GitHub does not itself republish.
5. Publishing → Adjust settings: retain Autoscale, current custom-domain binding, public port/build/run commands and public secrets. Record machine/max-server settings. Configure only approved beta settings in production Secrets after implementation. Provision the beta backend/database/auth separately; choose its machine/runtime from measured synthetic startup and memory, not an assumed VM size.
6. Apply reviewed beta migrations and backup/restore rehearsal. Bootstrap one administrator through the updated database-aware audited CLI; do not use an automatic startup admin that restores revoked access. The current `npm run beta:admin -- invite EMAIL admin` is SQLite-only and must be adapted before using it on managed PostgreSQL.
7. With beta inference disarmed, Publish only the approved existing-app release. Confirm public pages first; ensure unauthenticated beta API requests fail as JSON, not HTML. Test HTTPS/deep links, callback/logout, owner login, direct-origin denial and immediate revocation.
8. Admin management page remains `/bhoomiai/admin`. After the store/auth adaptation: Invite exact email → choose role and quota → separately send approved invitation. User opens `/bhoomiai`, completes email OTP, accepts research terms, then asks questions. Access is decided by verified identity plus database record. Revoke database access first; existing session must be denied immediately. No code edit per invite.
9. Complete the separate controlled Runpod test before arming chat. Use `deploy/beta/runpod_endpoint.example.json` and `compatibility_probe.py`; actual pinned `Qwen/Qwen3-4B-Instruct-2507` revision and original checkpoint-160 rank-16 PEFT adapter, not a base-only alias. Record hashes, `/models` parent, native tools, verifier/geography and scientific fallback. The existing audit gives detailed GPU setup; no test has run.
10. Approve real data sources/derived fields, processors/regions/privacy and monitored spending. Leave unresolved datasets excluded. Then owner/two-testers → five-user canary → 10–20; never bypass model-registry gates to enable the beta.

Emergency: persisted beta pause → disarm cloud approval → stop relay/endpoint and queued jobs → verify workers/billing stop. Keep public Replit running. Roll back only beta code/settings through a reviewed release, then Publish; do not reset the database, remove domain bindings or roll back unrelated GIS work. A simple local pause does not end Runpod loading/active-job/idle/storage billing.

## Costs and approval sequence

Existing public Replit cost remains its present plan; incremental backend CPU/database/SMTP fees need account quotes. Budget allowance for planning: CPU $15–30/month and database $0–25+/month (not a Replit quote); auth plan/SMTP cost must be verified before choosing a paid tier. Current Supabase Pro starts at $25/month if selected; existing managed PostgreSQL may avoid a second database subscription. GPU estimate remains $0.20–$1 for an attended short test, proposed $5 operator ceiling; retained 20 GB volume about $1.40/month under previously inspected rates. Recheck live pricing at approval; funding deposit/taxes/FX are separate.

**Next step needs no cloud approval:** implement and test the scoped OIDC/session, HTTPS proxy, PostgreSQL persistence/migrations and deployed-process supervision adapters locally, preserving existing UI/science. The exact backend host choice remains provisional until resource/runtime settings are known.

**Next external approval:** create/configure the selected authentication service and isolated beta database/backend resources with an explicit provider/region/cost scope. This excludes DNS changes, publishing, live secret edits, email invitations and GPU/artifact transfers. Each stays separately gated. Read-only inspection of Publishing settings can happen first.

References: [Replit deployment types](https://docs.replit.com/features/publishing/deployment-types), [Replit Secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets), [Auth0 email OTP](https://auth0.com/docs/authenticate/passwordless/authentication-methods/email-otp), [Auth0 JWT validation](https://auth0.com/docs/secure/tokens/json-web-tokens/validate-json-web-tokens), [Supabase passwordless alternative](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Supabase pricing](https://supabase.com/pricing). Existing GPU instructions: `BHOOMI_BETA_DEPLOYMENT_READINESS_AUDIT.md`.
