# Bhoomi AI private beta — launch and operator checklist

Updated 12 October 2026. Participant URL: **https://climreswash.in/bhoomiai**. Management URL: **https://climreswash.in/bhoomiai/admin**. APIs: `/bhoomiai/api/*`.

The beta pages are now part of the existing React/Vite application. No public navigation, existing public page, production data or live configuration was changed by this task. The earlier plan's separate beta website/hostname is superseded by this document. A private backend service is an implementation detail, not a second participant website.

## Current hosting evidence and decisions

Read-only public checks on 12 October found:

- Nameservers: `dns1.bigrock.in` through `dns4.bigrock.in`.
- Apex A record: `34.111.179.208`; no apex CNAME was returned.
- HTTPS `/` and `/bhoomiai` both returned 200 with the same 1,985-byte SPA shell, `server: Google Frontend`, Express headers and HSTS. Curl's certificate verification succeeded. A 200 SPA shell does not establish a deployed beta or authentication.
- `.replit` declares Node 20, Replit autoscale, `npm run build` and `npm run start`. This suggests Replit behind Google's frontend; the actual deployment/account settings have not been authenticated or inspected.
- Existing application login uses username/password and a public-app session. It does not verify participant email identity and is not reused as beta authentication.

**Approval needed:** confirm the live Replit deployment, custom domain bindings, resource/storage plan and origin address in its dashboard. Do not change the current production deployment target or runtime just to add this pilot.

Recommended topology for an autoscaling public host:

```text
climreswash.in / all existing public pages -> existing host, unchanged
climreswash.in /bhoomiai and /bhoomiai/admin -> existing React application + Cloudflare Access
climreswash.in /bhoomiai/api/* -> Access -> scoped Worker -> private Tunnel -> beta gateway
beta gateway -> encrypted persistent SQLite + private Core workers -> loopback relay -> Runpod
```

The gateway runs Node 24 for built-in SQLite. The public host imports only the lightweight proxy and does not import SQLite. Keep SQLite on one persistent host, not an ephemeral autoscale filesystem or multiple replicas.

`deploy/beta/edgeProxy.ts` and `wrangler.jsonc` prepare the API-only Worker option. Worker-to-gateway calls require a separate origin secret plus the user's signed Access JWT. No model/API key is ever sent to a browser or the public host. The backend hostname serves no frontend and refuses clients without both controls. Cloudflare Tunnel publishes no host port.

Alternative for a confirmed persistent host that can safely supervise local beta processes: set `BHOOMI_BETA_GATEWAY_URL=http://127.0.0.1:5100` on the public host. `server/betaProxy.ts` checks identity for private page requests and forwards beta APIs before public parsers/sessions/response logging. Only loopback is accepted. Leave this variable unset with the Worker topology: public-origin beta API requests then return 503, so bypassing the Worker does not expose data.

## Milestones already implemented locally

- [x] Existing-app React routes and isolated `/bhoomiai/api` namespace.
- [x] Signed Cloudflare JWT verification (issuer, audience, key, signature, expiry and issue time) plus individual server-side email allowlist. Merely entering an email cannot authenticate.
- [x] Authenticated consent, chat, feedback and user-owned history; admin role checks on management/review/export. Streaming, arbitrary scientific-tool calls and unknown APIs are authenticated and denied rather than exposed.
- [x] Invite, suspend/revoke, restore, role and daily-quota controls; last administrator protection; invitation expiry supported by the management API.
- [x] Current-token logout revocation; suspended accounts denied immediately; restoring access does not restore old tokens; fresh sign-in is required.
- [x] Thumbs feedback, categories and corrections; immutable interaction consent snapshot, model identity, verifier result and private tool/source provenance. Feedback exports never authorise training.
- [x] History ownership, admin filters/pagination, full matching CSV/JSONL export, CSV formula protection, review status and audit.
- [x] Per-user/global quotas and concurrency; conservative admission reservations; persistent pause/monthly usage; relay reservations survive restart; missing/stale approval and billing evidence stop GPU dispatch.
- [x] Strict JSON writes with same-origin checks, bounded bodies, path/secret redaction, explicit public reply DTO and no private debug routes.
- [x] Cloud bundle requires current-checksum source approvals; checks every hex record rather than only the first; rejects symlinks, model weights, restricted datasets and secrets.
- [x] Core research process environment is separate from the gateway's production environment. Existing accepted-model and experimental registry gates are unchanged; registry remains experimental and `deployable=false`.
- [x] Whole-turn deadline passed to Core; model calls use remaining time. Timeout/identity uncertainty pauses future gateway dispatch. Provider cancellation remains a live validation gate.

## Approval gate A — domain and authentication

- [ ] Export and review all existing DNS records, including email/MX/TXT/CAA/DNSSEC, before any migration. Keep them intact.
- [ ] Approve Cloudflare onboarding/proxying for the existing apex domain. BigRock delegation is currently visible; free full-zone onboarding usually entails a nameserver change. Investigate a supported partial-zone arrangement if delegation must stay at BigRock; do not assume it is free or available.
- [ ] Verify Replit custom-domain compatibility before proxying. Keep the existing origin binding and public routes. Use HTTPS to origin with Full (strict), never Flexible.
- [ ] Create one Access application protecting **both** `climreswash.in/bhoomiai` and `climreswash.in/bhoomiai/*`, including `/admin` and `/api/*`, with the same audience tag. Configure the authorization cookie path to cover these requests. Avoid more-specific bypass rules.
- [ ] Enable email one-time PIN for invited users; use exact individual email selectors, not entire domains. Apply SSO/MFA to administrators where possible. Keep policies and the database allowlist consistent.
- [ ] Proposed session duration: eight hours for participants, one hour for administrators. Confirm policy precedence with real accounts.
- [ ] Count existing users and administrators against the free 50-seat allowance. Aim for 20 initially and at most 48 participants plus two admins if the account has no other occupied seats.
- [ ] Protect the private backend with the Worker origin secret and signed participant JWT; do not configure a second Access policy that overwrites the forwarded participant identity with a service-token identity. Test this header behavior on the actual tunnel before admitting users.
- [ ] Route only `/bhoomiai/api*` through the Worker. Its code rejects non-API paths; public routes stay with the existing host. Apply no-store caching rules to private paths.

Cloudflare supports path-scoped applications and email OTP. The gateway validates the identity independently of edge configuration. [Path policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [email OTP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [authorization cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/).

## Required secrets and operational configuration

Configure secrets directly in the host/Cloudflare/Runpod secret manager, or via a protected operator environment sourced from a mode-0600 file. **Never paste privileged keys into chat, use command-line secret values, commit them, or include them in exported logs.** Examples contain placeholders only.

| Setting | Where | Purpose |
| --- | --- | --- |
| `BETA_ACCESS_TEAM_DOMAIN`, `BETA_ACCESS_AUD` | Private gateway environment | Non-secret Access issuer and application audience |
| `BETA_PUBLIC_ORIGIN=https://climreswash.in` | Gateway | Strict write-origin check |
| `BETA_HASH_KEY` | Private gateway secret | Random 32+ character HMAC key; back up separately from SQLite |
| `BETA_DB_PATH=/data/beta.sqlite` | Gateway persistent volume | Invites, roles, consent, feedback, usage and audit |
| `BETA_OPERATOR_ID` | Approved operator environment | Identifies the administrator making CLI changes |
| `BETA_ORIGIN_KEY` | Worker secret + private gateway secret | Random 32+ character shared origin key; required for Worker topology |
| `BETA_ORIGIN` | Worker configuration | Private API hostname, no user-controlled upstream |
| `TUNNEL_TOKEN` | cloudflared host secret | Backend tunnel only |
| `RUNPOD_API_KEY` | Private relay secret only | Scope to the one endpoint if supported; never place on public host/Worker |
| `HF_TOKEN` | GPU worker secret only, if needed | Read-only access to the approved private adapter artifact |
| `BETA_CLOUD_APPROVED=0` initially | Gateway | Dispatch remains disarmed until separately approved |
| `BETA_APPROVAL_MANIFEST`, `RELAY_APPROVAL_FILE` | Read-only secret-file mounts | Exact endpoint/model/artifact approval, contact and regions |
| `RELAY_BILLING_FILE` | Read-only mount updated atomically by approved operator/monitor | Recent provider billing and shutdown evidence |
| `RELAY_BUDGET_DB=/data/relay-budget.sqlite` | Relay persistent storage | Durable conservative reservations and pause state |

Store operator approvals separately from source. `approval.example.json`, `billing-attestation.example.json` and `source-clearance.example.json` define their schemas. Actual records are git-ignored. Configure encrypted persistent storage and encrypted backups; SQLite itself is not encrypted. The gateway container has no published ports and runs without root capabilities. The Node base digest was verified in the local smoke test. Pin cloudflared/worker-vLLM by digest and retain a transitive dependency lockfile before deployment; those release choices remain unverified.

`docker-compose.yml` prepares the private backend only. Add read-only mounts for the approval and billing files at the configured `/run/secrets` paths. Verify fresh-volume ownership for UID 10001 and restore backups locally. Separate worker cache/log directories are configured by the entrypoint.

## Approval gate B — datasets and model artifacts

- [ ] Review every mixed/derived field in the hex data, WASH sources, ERA5 data and quoted methodology, including permission to send excerpts to the chosen cloud processors. A training-policy label is not cloud clearance.
- [ ] Populate `source-clearance.json` with current hashes, terms URLs, attribution, derived-field review and named approval. Bundle building refuses absent/mismatched records. It never uploads anything.
- [ ] Keep CHIRPS/monsoon outputs, IFI flood labels, provisional LGD crosswalks, forecast snapshots and unresolved sources out. Approve training-adapter provenance separately; excluding files cannot prove their values are absent from weights.
- [ ] Approve only the original checkpoint-160 PEFT adapter, tokenizer/template, base revision and required licence notices for transfer. Do not upload training/evaluation data, feedback databases, full repository or GGUF artifacts by default.
- [ ] Finalise privacy contact, processor names/regions, retention/deletion, withdrawal and backup lifecycle. Display the notice before collecting real interactions. Proposed raw-record retention: pilot plus 90 days; backup expiry within 30 additional days.

The existing public website/data files are unchanged. The beta backend exposes no raw dataset download; this does not retroactively make the public site's existing map data private.

## Approval gate C — Runpod and spending

- [ ] Explicitly approve endpoint creation, artifact transfer, region and a **$5–10 benchmark allowance** before any GPU starts.
- [ ] Candidate: pinned Qwen/Qwen3-4B-Instruct-2507 BF16 base with rank-16 checkpoint-160 PEFT LoRA; 24 GB L4/A5000-class flex worker. `runpod_endpoint.example.json` is a specification, not a direct API payload. Pin the worker-vLLM image and tokenizer/template.
- [ ] Confirm adapter selection through `/models` and request model name; all target modules load; no silent base-model fallback. Confirm tool parser/template behavior, context and scientific parity against the local GGUF runtime. Registry stays experimental and `deployable=false`.
- [ ] Use zero active workers, one maximum worker, bounded provider execution timeout and short idle tail. Disable auto-pay; avoid postpaid billing. GPU key must not grant unrelated account administration if endpoint scoping is available.
- [ ] Verify provider worker shutdown/cancellation in an approved benchmark. A local HTTP timeout cannot prove the GPU stopped. A prepaid balance is not treated as a proven Serverless hard cap.
- [ ] Supply billing evidence at least every five minutes. Missing, stale, negative or wrong-endpoint evidence denies dispatch. A provider-backed monitor/usage export and shutdown process must be selected and tested before unattended operation; no provider billing API is assumed or called by this local preparation.
- [ ] Start with conservative gateway reservations (300 seconds/turn) and relay reservations ($0.10/model request, no refunds). Real cost plus reserved cost is checked conservatively; failures/restarts do not erase it. These limits can support far fewer turns than the forecast below. Adjust only after measured billable-time bounds and revised owner approval.
- [ ] Gateway timeout, non-busy Core errors and model identity mismatch pause future chat dispatch; relay network/5xx failures pause relay dispatch. Re-enabling requires operator investigation of existing provider work. The gateway's Enable button does not override relay pause or stale billing evidence.
- [ ] Provider-side costs from booting/idle workers can continue without new API requests. Local controls cap admission, not all account billing. Keep the beta disarmed until actual provider shutdown and spend reconciliation are verified.

Runpod/vLLM document Qwen3 and PEFT LoRA support, but this specific cloud adapter/runtime remains untested. The local GGUF adapter is not presumed compatible with the stock vLLM template. [Runpod LoRA configuration](https://docs.runpod.io/serverless/vllm/environment-variables), [vLLM LoRA](https://docs.vllm.ai/en/latest/features/lora/).

Estimated 30-day funding: **$60–110 moderate use**, proposed **$150 total ceiling**, with $100 GPU allocation and a $90 conservative dispatch threshold. Assumptions: 3,000 turns, 37.5 effective billable GPU hours, CPU/backups $15–30, artifact storage $2–5, benchmark $5–10, plus contingency. These are forecasts, not tested capacity. L4/A5000 flex is $0.69/hour and 4090 $1.10/hour; provider billing includes worker start, execution and idle time. Heavy use could reach $165–275, requiring a new budget. Taxes, FX, domain/paid seats and reviewer labour are excluded. [Runpod prices](https://www.runpod.io/pricing), [billing phases](https://docs.runpod.io/serverless/pricing). Worker/host costs must be confirmed for the actual account plan.

## Exact invitation and revocation process

First administrator bootstrap, on the private host after secret environment setup:

```sh
npm run beta:admin -- invite owner@example.org admin
```

The operator needs approved host access, not a privileged key in chat. Codex can perform a specifically approved user change through that host CLI/SSH session or an authenticated administrator session. It must not send invitation emails or alter Cloudflare policy without authorisation for those actions. The CLI requires `BETA_DB_PATH`, `BETA_HASH_KEY` and `BETA_OPERATOR_ID` from the secure host environment. In the minimal backend bundle, use `node_modules/.bin/tsx scripts/beta-admin.ts ...` because it has no npm scripts.

To invite a person:

1. Obtain owner approval for the exact email and role.
2. Add the same exact address to the Access application's allow policy using Cloudflare dashboard (or separately authorised scoped automation).
3. Use `/bhoomiai/admin` Invite user, or `npm run beta:admin -- invite person@example.org user`.
4. Set a daily quota with the dashboard or `npm run beta:admin -- quota person@example.org 40`.
5. Send the approved invitation containing `https://climreswash.in/bhoomiai`, purpose, privacy/contact and expiry. Neither the dashboard nor CLI sends mail automatically.
6. The participant verifies the email through Access OTP, then accepts research consent. Training consent is optional and initially unchecked.

To revoke immediately:

```sh
npm run beta:admin -- revoke person@example.org
```

Or click Revoke access in the management page. Every subsequent API request reads current user status; in-flight results are rechecked before delivery and not returned after revocation. Already downloaded text cannot be retracted. Also remove the address from Access policy and revoke its Access session. Database denial does not wait for Cloudflare session propagation.

Role change: `npm run beta:admin -- role person@example.org admin` (or `user`). The last active administrator cannot be demoted/revoked. Restore: `npm run beta:admin -- restore person@example.org`; fresh sign-in after the revocation timestamp is required. Old JWTs remain refused. User lists are available in the dashboard or `npm run beta:admin -- list` on the protected operator terminal.

Sign out first revokes the current signed JWT in the beta database, then goes to `/cdn-cgi/access/logout`. Cloudflare logout clears its cookie and affects its other Access apps too; the beta blocks replay immediately rather than waiting for edge propagation. [Cloudflare session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).

## Local verification and remaining live checks

Local commands:

```sh
npm run check:beta
npm run test:beta
python3 -m unittest discover -s deploy/beta -p 'test_*.py'
# Optional local Docker smoke: synthetic data only; disarmed inference, no published ports.
python3 tests/betaContainerSmoke.py
npm run build
# Set PLAYWRIGHT_MODULE to the installed playwright-core module path; Chrome must be installed.
npm run test:beta:e2e
# From research/bhoomi_ai_core_v0:
PYTHONPATH=src:tests python3 -m unittest discover -s tests
```

Browser tests use the actual built existing-app React client, signed test JWT verification, and mocked Core/identity keys only inside test code. They establish routing and application authorization; they cannot establish real email delivery, Cloudflare cookies/callbacks, GPU inference or live-domain end-to-end behavior.

Before invitations, explicitly approve staging/private deployment and verify:

- [ ] Valid HTTPS chain, public homepage/maps/admin unchanged, and canonical domain behavior.
- [ ] Fresh `/bhoomiai` and `/bhoomiai/admin` deep links; unknown/private paths do not fall through into public APIs.
- [ ] Real invited/uninvited OTP delivery/login, Access return URL, signed headers through Worker/Tunnel, cookie path and same-origin JSON requests.
- [ ] Expired/forged/revoked tokens; role changes; immediate database revocation; attempted direct origin/backend access.
- [ ] Logout on the real domain, fresh sign-in and logout replay denial. Cloudflare callbacks and `/cdn-cgi/*` must stay handled by Cloudflare, not by the Worker/public SPA.
- [ ] Scientific golden cases, unavailable-data refusals, model identity, actual GPU latency/memory/cost and two concurrent users.
- [ ] Persistent volume boot, backup restore, two private Core directories, cleanup/retention and provider emergency stop.
- [ ] Five-person canary first, then 20 invitees, then expansion within seats/budget only after review.

## Emergency shutdown and rollback

1. Click Disable chat or run `npm run beta:admin -- pause`. Pause survives restart; history/admin remain available.
2. Disarm `BETA_CLOUD_APPROVED`, pause the relay (its persistent `control` table), stop backend Core/relay processes and disable the Runpod endpoint in its console. Verify workers are actually stopped and billable usage stops; revoke the Runpod key if compromise is suspected.
3. Deny the Access beta application if all access must stop. Preserve encrypted feedback/usage/audit evidence for review; do not delete the database as a shutdown shortcut.
4. Roll back only the beta app commit/build and the `/bhoomiai/api*` Worker route. Keep the existing public origin and DNS records. Do not roll back unrelated working-tree changes.
5. If Cloudflare onboarding must be reversed, restore the recorded prior nameservers/records under separate owner approval; allow DNS propagation. First disable beta dispatch so stale routes cannot spend money.
6. Restore/re-enable only after incident review, fresh approvals/billing evidence and verified no orphaned provider work. Never reset reservation databases to regain allowance.

No cloud resource, live DNS record, deployment, model/data transfer, payment, GPU or invitation email was created by the local work. The beta is prepared locally and remains disarmed pending the above approvals.
