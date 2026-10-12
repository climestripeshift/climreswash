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

One authoritative supervised gateway/Core service remains the supported pilot topology. PostgreSQL quota/login admission is coordinated across database clients, but conversation-to-Core affinity remains in memory; after restart, saved history persists and a new turn must start a new conversation. Do not horizontally scale Core/gateway without further session-routing tests. Existing SQLite files remain untouched.

Live release gates: approved database/schema/roles and encrypted backup policy; backend hosting/runtime/HTTPS plus Replit proxy secrets; live custom-domain/session/direct-origin tests; privacy and dataset clearance; original checkpoint-160 CUDA/tool-call compatibility; provider billing/shutdown validation. See `BHOOMI_BETA_ACCESS_GUIDE.md` for operator commands. Auth0/Cloudflare are not immediate requirements.
