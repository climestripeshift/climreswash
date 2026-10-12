# Private Bhoomi AI beta: email and access-code guide

Current local implementation, 12 October 2026. This supersedes Auth0/Cloudflare requirements in earlier plans. No authentication provider account or BigRock DNS change is required. Nothing has been published.

## What users do

Open **https://climreswash.in/bhoomiai**, enter the exact invited email and the private access code you share, and click **Sign in**. They then accept the research notice. Codes are reusable until rotated/revoked; sessions expire after eight hours by default. This proves possession of a private invitation code, not ownership of the email inbox. Ask testers not to forward codes. The public navigation contains no beta link; beta pages/API responses use no-store and noindex headers. Hiding a URL is not the access control.

## Add a person

After the database/backend are approved and configured, run these commands in the backend's trusted shell. For now they can be used only with an isolated local database. Never paste database passwords, HMAC keys or access codes into Codex prompts.

1. Configure `BETA_DATABASE_URL`, `BETA_HASH_KEY` and `BETA_OPERATOR_ID` through the backend secret environment. Use an isolated beta database account; do not overwrite the public app's `DATABASE_URL`.
2. Choose a **new file outside the repository** for private delivery:

```sh
export BETA_INVITATION_FILE=/tmp/bhoomi-invitation-tester.txt
npm run beta:admin -- invite tester@example.org user
npm run beta:admin -- quota tester@example.org 20
```

3. Open the named file privately on your own computer. It contains the URL, email and generated code, with owner-only file permissions. The CLI never prints the code. Share its contents privately with that person; remove the delivery file after sharing. Do not attach it to Git, a public message or exported logs. On a remote backend, recover it through your secure operator channel, not the public website.
4. For the initial owner account, use the same process with `invite YOUR_EMAIL admin`. The CLI records the operator making the change. Startup never automatically recreates a revoked administrator.

Each invocation generates a random 256-bit code and stores a salted scrypt hash. The admin page's **Invite** adds only the allowlist entry; use the CLI to issue its code. No code is returned by admin APIs or user listings.

## Revoke, rotate, list or pause

```sh
npm run beta:admin -- list
npm run beta:admin -- revoke tester@example.org
# Pick another NEW delivery file before rotation; existing files are never overwritten.
export BETA_INVITATION_FILE=/tmp/bhoomi-invitation-tester-new.txt
npm run beta:admin -- issue-code tester@example.org
npm run beta:admin -- restore tester@example.org
npm run beta:admin -- role tester@example.org user
npm run beta:admin -- pause
```

Revocation deletes login sessions and blocks future requests. Restoring access does not resurrect those sessions. Rotation invalidates the old code and all sessions; it does not itself restore a suspended user. Last-administrator removal is refused, including concurrent changes. `/bhoomiai/admin` also supports revoke, role, quota and pause controls after the owner signs in. Pause disables chat; login/admin/history remain available for recovery. Only resume after reviewing the incident and spending evidence.

## One-time configuration, after separate approval

Public Replit stays Autoscale with its existing `npm run build` and `npm run start`. Preferred CPU topology is now opt-in cohosting: `BHOOMI_BETA_COLOCATE=1` supervises the private gateway and, only after cloud approval, one scientific Core plus relay per replica. The same-origin proxy uses loopback; no separate frontend or DNS changes. Set `BETA_PUBLIC_ORIGIN=https://climreswash.in` and `BETA_ORIGIN_KEY` (32+ random characters, server secret). The remote HTTPS `BHOOMI_BETA_GATEWAY_URL` option remains available if resource limits require a separate backend. Default-domain beta requests are denied; public routes are unaffected.

Backend: `BETA_AUTH_MODE=code`, `BETA_INGRESS_MODE=proxy`, matching `BETA_ORIGIN_KEY`, isolated `BETA_DATABASE_URL` (remote connections require `sslmode=verify-full`), `BETA_HASH_KEY`, `BETA_PUBLIC_ORIGIN`, optional `BETA_SESSION_SECONDS` (60–28,800; default 28,800), `BETA_LISTEN_HOST`/`BETA_PORT`, existing quotas and inference approval settings. Keep `BETA_CLOUD_APPROVED=0`. Startup requires migrated schema; it does not create/modify production tables. No email-only, header-based, Auth0 or development sign-in path exists in code mode. SQLite remains only a legacy/test implementation.

The published runtime must retain Node/tsx and Python 3 with `deploy/beta/requirements-postgres.txt` installed. `.replit` already declares Node 20 and Python 3.11; those modules alone do not establish published dependency availability. Private children never inherit the public `DATABASE_URL` or `SESSION_SECRET`. Keep `BETA_CLOUD_APPROVED=0` until separate data/model/budget approval: only login/admin/history gateway starts, without Core, relay, weights or a Runpod key. Child crashes stop the private group, retry three times, then leave beta unavailable while the public server continues. Core warmup denies chat before quota/spend admission. Core/relay/gateway bind only loopback. Do not change public `DATABASE_URL`, build/start commands or scaling settings.

## Migrations and backup

Do not run public `db:push` to create beta tables. Once the isolated target is explicitly approved, use its secret environment:

```sh
BETA_MIGRATIONS_APPROVED=1 node --import tsx scripts/beta-migrate.ts
```

Apply migrations 001–003 as a separate operator/migration role; then review `deploy/beta/provision-beta-role.example.sql`. Use `bhoomi_beta_runtime` in `BETA_DATABASE_URL`, never an owner/superuser or a role with access to public-site tables. Startup checks effective privileges and refuses unsafe roles. The role template does not alter public-site grants; if inherited PUBLIC privileges prevent isolation, stop and obtain approval for an isolated database instead. PostgreSQL state (including signed portable conversations, leases and revision checks) supports replica switching without Core affinity. Remote production URLs require verified TLS; `BETA_DB_TRANSPORT=replit-helium` is allowed only for the exact internal `helium/heliumdb` endpoint after its published-runtime availability is confirmed. Development Helium does not prove the production provider/endpoint. Versioned additive migrations create only `bhoomi_beta` tables; no SQLite file or public data is deleted or imported automatically. Existing SQLite records remain untouched. If old local records must move, review a separate import before pilot release.

Use the managed provider's encrypted snapshot/PITR where available. For an operator export, keep credentials in a protected libpq service file (`PGSERVICE=bhoomi-beta`), not a command argument; keep the file outside Git:

```sh
umask 077
pg_dump --schema=bhoomi_beta --format=custom --file=/tmp/bhoomi-beta-backup.dump
```

Encrypt the dump immediately with your approved backup tool, store it privately, and remove plaintext staging. Back up `BETA_HASH_KEY` separately. Restore **only into a new isolated database** first:

```sh
# Configure PGSERVICE for the isolated restore target first.
pg_restore --dbname=RESTORE_DATABASE_NAME --no-owner --no-privileges /tmp/bhoomi-beta-backup.dump
```

Check users, interactions, feedback, consent snapshots, quota totals, spending and pause state. Keep restored service paused, invalidate restored login sessions, and verify permissions before approving a reconnect. Never delete usage/reservation/revocation records to recover allowance. Local disposable-database backup/restore was exercised; managed-provider backup/PITR remains a live release check.

## Local tests and release blockers

`npm run test:beta` covers the retained gateway controls. `python3 tests/runBetaPostgresTests.py` requires local Docker `postgres:16` and Python dependencies from `deploy/beta/requirements-postgres.txt`; it disposes of its local database/volume. Use a virtual environment. Build the existing app first; set `BETA_TEST_PUBLIC_BUILD` to its `dist` directory for the actual production-start test. Set `PLAYWRIGHT_MODULE` to installed playwright-core and `BETA_BUILD_DIR` to the production client build to include the HTTPS browser flow. These tests never use real credentials, invited-user codes or inference providers.

Before putting Bhoomi online: approve an isolated PostgreSQL schema/permissions/backup policy, configure the authenticated backend and Replit proxy secrets, pass live HTTPS/cookie/direct-origin tests, approve dataset/privacy/processor terms, run the separate pinned checkpoint-160 GPU compatibility test, and verify provider monitoring/shutdown. Auth0 and Cloudflare are not prerequisites. Application caps stop new dispatch; already-running GPU work and retained storage may still bill.

Only push the reviewed release after approval, pull it into the existing Replit app with `git pull --ff-only`, verify the commit, then separately approve Publish. Do not publish the unrelated dirty working tree. Check `/`, `/grid`, `/grid-v2`, `/methodology`, `/simulator` and existing public login before inviting testers. Roll back beta-only code/settings, leaving domain/public routes unchanged.
