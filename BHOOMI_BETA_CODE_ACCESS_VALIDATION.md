# Access-code beta: local implementation evidence

12 October 2026; baseline `f905bd3` / `2d0eaea`. No cloud provisioning, production database migration, secret edits, DNS changes, pushes, publishing, model transfers or GPU calls.

Implemented:

- Email plus per-person random 256-bit access code; salted, versioned scrypt hashes with pinned cost; no email/header-only authentication.
- PostgreSQL-backed opaque sessions, hashed session tokens, eight-hour default expiry, Secure/HttpOnly/SameSite=Lax beta cookies, logout, rotation and immediate revocation.
- Durable per-email/global login throttling; exact allowlist, current database roles and last-admin protection.
- Existing gateway/feedback/admin behavior ported to asynchronous PostgreSQL in isolated `bhoomi_beta` schema; explicit additive migrations, no public schema updates or automatic SQLite import.
- Transactional quota/compute reservations and database request leases; durable relay-spending reservations and pause; verified TLS required for remote PostgreSQL.
- Replit's same-origin proxy supports fixed HTTPS upstream, server-held origin secret and beta-session cookies only. Missing/failed/unexpected upstream responses fail as JSON; forged identity headers are not forwarded in code mode.
- Existing React route now contains a login form. Public navigation has no beta links; private responses retain no-store/noindex. No public page, map source, `.replit` or public build/start command changed by this milestone.
- Audited CLI generates private delivery files outside the repository with mode 0600 and refuses overwrites. Codes are never printed or returned by APIs. Backend can start disarmed without GPU credentials/data.

Validation:

| Check | Evidence |
| --- | --- |
| Focused and full TypeScript | Passed |
| Existing gateway/proxy/security regressions | 30 passed |
| Real disposable PostgreSQL/code-auth/CLI/entrypoint/concurrency integration | 13 passed |
| PostgreSQL relay-spending concurrency/restart/stale-billing | Passed |
| HTTPS browser on clean production build | Login, cookies, consent, chat, feedback, admin denial, logout/revocation passed; homepage and GIS map mount; no public beta navigation |
| Database backup/restore | Separate local restore database preserves users, interactions, feedback, quotas, spending and paused state |
| Existing deployment Python regressions | 18 passed; PostgreSQL-specific case runs separately in its disposable suite |
| Scientific Core regression | 276 passed; no scientific/model-registry edits |
| Clean release frontend/backend build | Passed; existing guarded import.meta/CJS and chunk-size advisories remain |
| Private runtime dependency audit | Zero reported vulnerabilities |
| Local non-root/read-only container | Passed, synthetic fixtures only, relay disarmed; no provider request |

All codes, databases, HTTPS keys and inference replies in automated tests are synthetic. The browser's external requests are blocked. Public API tests use local fixtures; live production GIS/API data parity remains a release check. Access codes authenticate invitation possession, not verified email ownership.

The Autoscale continuation removes access-code mode's in-memory conversation affinity. PostgreSQL owns bounded conversation snapshots, ownership, exclusive expiring leases and revision checks. Each fresh Core receives an authenticated portable snapshot and retains no hosted session cache. Legacy Cloudflare/SQLite fixture routing remains unchanged; existing SQLite files remain untouched.

Live release gates: approved database/schema/roles and encrypted backup policy; backend hosting/runtime/HTTPS plus Replit proxy secrets; live custom-domain/session/direct-origin tests; privacy and dataset clearance; original checkpoint-160 CUDA/tool-call compatibility; provider billing/shutdown validation. See `BHOOMI_BETA_ACCESS_GUIDE.md` for operator commands. Auth0/Cloudflare are not immediate requirements.

## Autoscale continuation — local evidence

- Loopback access-code proxy forwards only the beta session cookie and its Set-Cookie response; identity headers remain untrusted. Private APIs never fall through to the public SPA shell.
- Existing npm start supervises optional beta children; public build/start commands, public routes, GIS source and model acceptance gates are unchanged. Non-Linux local startup no longer requests Linux-only socket reusePort.
- Startup refuses database roles with elevated flags, role memberships, schema ownership, public CREATE or effective non-beta table privileges. Migration 003 and the role template are operator-only; no production schema was changed.
- Offline Linux measurements with a cold district cache (722 districts), the two explicitly mounted local scientific files, real tool/verifier/fallback and the compiled public server: 512 MiB container used 174.2 MiB; 1 GiB container used 181.9 MiB. Core peak RSS was 114.8–114.9 MiB; public Node RSS 104.7–111.9 MiB. Model weights were absent; external networking disabled. These measurements exclude gateway/relay overhead and concurrent GIS/browser workload. Linux memory checks now respect remaining cgroup memory and retain existing 250 MiB stop / 600 MiB warning thresholds.
- Replit CPU cohosting is technically plausible, not a live capacity certification. Prefer verifying at least 1 GiB per replica without changing settings; a full-runtime/load check against the approved data bundle remains necessary. No separate CPU host is inherently required by the measured Core.
- Collect Publishing machine RAM/vCPU and maximum replicas, runtime dependencies, production database provider/endpoint type (no credentials), support for an isolated role/schema, connection limit and backup/PITR settings. If Helium cannot provide role isolation or a safe published endpoint, it cannot be used merely by reusing the public database owner URL.
- No cloud resource, production secret, publishing action, dataset/adapter transfer or Runpod request was performed. Frozen test_v3 was not accessed; only explicit transport/session tests ran. Earlier 276-test Core evidence above belongs to the prior milestone and was not rerun here.

Current continuation checks passed: 30 retained gateway/proxy tests; 15 PostgreSQL/access-code/startup/replica tests; 3 supervisor/transport tests; 4 explicit portable-Core/transport/memory tests; PostgreSQL relay-spending concurrency and separate schema backup/restore; HTTPS Chrome login/cookie/feedback/revocation and public homepage/GIS mount; focused TypeScript, full TypeScript against the isolated release snapshot, and existing frontend/server production build. Browser inference is synthetic. Production Replit, real GPU tool-call parsing and approved-data full-runtime capacity remain untested. No broad Core/frozen evaluation suite was invoked.
