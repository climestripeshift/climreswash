# Shared PIN beta login — reviewed deployment steps

Implemented locally only. No production secret, Runpod, dataset or published deployment was changed. Keep `BETA_CLOUD_APPROVED=0` and the existing database pause enabled. This change does not approve inference, research processing or additional beta participants for the owner-only GPU experiment.

Ordinary users open `https://climreswash.in/bhoomiai` and enter one 6-digit PIN. There is no ordinary-user email, invitation or registration form. The existing research notice/consent remains before the first question. Administrators use `https://climreswash.in/bhoomiai/admin` and their existing administrator email/access code on `/bhoomiai/api/auth/admin/login`. Existing admin credentials are not replaced. Legacy ordinary invitation-code sessions no longer authenticate in the deployed PIN gateway.

## Deployment, only after explicit publication/configuration approval

1. Review only this PIN change and its migration, preserving other unapproved working-tree changes. Build with `npm run check:beta` and `npm run build`. The public build/start commands remain unchanged. Publish the reviewed source/build only when separately approved; rollout needs the backend and frontend together.
2. In the authorized isolated beta database operator/migration environment, preserve `BETA_DATABASE_URL`, `BETA_DB_TRANSPORT`, `BETA_HASH_KEY` and `BETA_OPERATOR_ID`. Do not use or change the public-site `DATABASE_URL`. Apply the additive migration using `BETA_MIGRATIONS_APPROVED=1 node --import tsx scripts/beta-migrate.ts`. It advances the beta schema to version 4, adds `pin_visitors`/`pin_sessions`, and grants the existing `bhoomi_beta_runtime` role access to those two tables if that role exists. It creates no public tables, does not change admin accounts, and does not resume inference. If the runtime role has a different name, the operator must grant SELECT/INSERT/UPDATE/DELETE on those two beta tables to that actual restricted role. No new service is needed.
3. Keep `BETA_AUTH_MODE=code`/`BETA_AUTH_PROVIDER=code` and existing proxy/TLS/session configuration. No plaintext PIN belongs in Replit Secrets or an environment variable. The PIN is configured privately in the isolated database as a salted scrypt hash of a server-keyed HMAC, using the existing stable `BETA_HASH_KEY` as the pepper. The migration leaves PIN access disabled by default. Never change `BETA_HASH_KEY` merely to rotate the PIN.
4. In a trusted interactive operator terminal, create a mode-0600 PIN input file outside Git without echoing or putting the PIN in shell history:

```sh
export BETA_PIN_INPUT_FILE=/tmp/bhoomi-shared-pin.input
python3 - <<'PY'
import getpass, os, re
pin = getpass.getpass('New shared 6-digit PIN: ')
if not re.fullmatch(r'[0-9]{6}', pin):
    raise SystemExit('Exactly six digits required')
fd = os.open(os.environ['BETA_PIN_INPUT_FILE'], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(pin)
PY
node --import tsx scripts/beta-pin.ts rotate
rm "$BETA_PIN_INPUT_FILE"
unset BETA_PIN_INPUT_FILE
```

The operator command needs existing private `BETA_DATABASE_URL`, `BETA_HASH_KEY` and `BETA_OPERATOR_ID`. It never prints the PIN or hash. The file must be new, outside the repository and mode 0600; invalid input or arguments fail without logging secret values. Delete the temporary file after successful configuration; share the PIN privately with the intended users. Do not enter it in chat, Git, URLs, cloud-init, logs or command arguments.

5. On the separately approved deployment, check the ordinary form has only one PIN field, PIN sessions cannot access admin routes, existing admin login works, and inference remains unavailable/paused. Do not resume inference as part of login deployment. For the first owner-only live experiment, leave shared PIN access disabled until additional participants are separately approved; the administrator can still use chat with the existing credentials once inference is independently authorized.

## Rotate or disable

Rotation uses the same private-input procedure and `node --import tsx scripts/beta-pin.ts rotate`. Disable with `node --import tsx scripts/beta-pin.ts disable`, with no PIN input. Both are atomic database operations: all ordinary PIN sessions are immediately invalidated across replicas; administrator sessions/credentials are preserved. Disabling PIN access does not disable administrator authentication or alter the emergency inference pause. No restart or new service is required for rotation/disable.

## Limits and privacy behavior

The gateway creates random internal pseudonymous browser identities after valid PIN entry; no personal email is collected. Each browser's consent, history, conversations and feedback remain isolated. The secure `BhoomiSession` cookie is HttpOnly, Secure, SameSite=Lax, scoped to `/bhoomiai`, and expires at the existing configured session duration (default eight hours). A separate secure HttpOnly visitor cookie lasts 30 days to preserve the browser identity through logout/login; clearing cookies creates a new anonymous identity and loses access to prior history.

Existing per-browser quotas, user concurrency, global concurrency, spending limits, feedback ownership and pause remain enforced. PIN users additionally share the existing `BETA_LIMIT_PER_DAY` allowance, so creating fresh anonymous identities cannot evade that aggregate cap. Admin quotas remain separate and the existing global cap still covers everyone. This PIN proves shared-secret possession, not a unique person's identity; individual person quotas cannot be authenticated without individual credentials.

PIN attempts reserve durable database slots before hashing. Five failures/pending verifications within 15 minutes lock the shared PIN for up to 15 minutes; a maximum of twenty attempts per minute bounds successful-login/hash work too. This applies across replicas and browser resets. Administrator throttling is separate. Because access is shared, the temporary PIN lockout affects all ordinary users; the administrator remains able to sign in and manage the pause/PIN. No PIN or IP address is stored in attempt logs.

Rollback: use the PIN-disable operator command first, keep inference paused, and restore the previously reviewed application build only under explicit deployment approval. Migration 4 is additive and can remain; do not drop beta data to roll back.
