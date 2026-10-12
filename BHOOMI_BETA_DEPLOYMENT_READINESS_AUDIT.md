# Deployment-readiness audit and first controlled compatibility test

12 October 2026; baseline `f905bd3`; cohort 10–20. **Not approved to launch.** All changes in this audit are local. No GPU, endpoint, volume, model transfer, DNS change, Access application or public activation was performed.

## Readiness ledger

| Blocker | Fix / current disposition | Evidence | Estimated expense | Owner action |
| --- | --- | --- | --- | --- |
| Actual hosting account not verified | Public NS remains BigRock; apex `34.111.179.208`; Google Frontend/Express and 1,985-byte SPA shell at beta/admin. `.replit` declares autoscale, but this is not proof of current account configuration. No usable authenticated deployment dashboard was obtained. | Refreshed DNS/HTTPS checks, certificate accepted; live account/deployment ID still unknown | $0 for inspection | Provide read-only deployment/domain dashboard access; approve any later hosting change |
| Cloudflare path protection absent/unverified | One Access app covering exact `/bhoomiai` and `/bhoomiai/*`; same audience for page, admin and APIs; exact-email policies; no domain-wide lock or path bypass | Origin JWT/allowlist controls tested; real OTP/cookie/Worker ordering still pending | Free tier candidate for 10–20 plus admins; verify account seats | Approve zone/proxy/Access/Worker/Tunnel setup; DNS migration separately |
| JWT rotation and direct-backend ingress gaps | Fixed bounded unknown-key JWKS refresh; finite integer issue/expiry checks; strict production expiry; Worker mode now requires origin secret at startup | 30 gateway/proxy tests including forged signatures, issuer/audience/expiry, allowlist/revocation and missing origin key | $0 | Configure issuer/audience and origin secret; real edge-to-origin check after approval |
| Cloud model/adapter identity and parser not validated | Pinned published worker image; original PEFT adapter hash/rank/targets and template verified locally. Probe requires actual `/models` adapter parent plus worker receipt. Native tool calls must pass; content-tag fallback alone fails | Artifact preflight and two synthetic Core/verifier test cases pass; no CUDA execution | Target $0.20–$1; propose $5 test ceiling | Approve artifact transfer, base download, test endpoint/volume and attended GPU run |
| No documented dataset cloud clearance | No `source-clearance.json` or signed source approvals found. All real datasets remain unapproved in this audit, including mixed hex/WASH and ERA5 inputs; training-policy labels do not authorise hosting | `data-readiness-audit.json` records current hashes; bundle build refuses absent clearance | $0 technical audit; expert/licence review cost unknown | Approve specific sources, cloud processing/derived-field rights and attribution; unresolved CHIRPS/IFI/LGD/forecast stay excluded |
| Dependency reproducibility/security | Added portable private-runtime lockfile; `npm ci`; Express 4.22.3 resolves three advisories found in the original private runtime. Public application dependencies unchanged | npm audit: zero reported vulnerabilities; locked container test | $0 | No approval for local fix; approve later release image deployment |
| Container/secret mounts and persistence | Pinned Node and cloudflared digests; added read-only **directory** mount for atomic billing updates; excluded private state from bundles; restrictive umask; tested named volumes and WAL-safe SQLite backup/restore | Non-root/read-only local container, two Core workers, disarmed relay; disposable volumes removed | CPU host/backup allowance $15–30/month | Choose host/region, encryption and off-host encrypted backup; approve provisioning |
| Quotas and spend safety | Single gateway only; proposed 20 questions/user/day, 200 global/day, one/user and two/global active turns. Durable reservations/pause and stale telemetry stop new dispatch. Closed leaked relay SQLite connections. UI labels reserved/estimated compute, not measured GPU billing | Quota/concurrency/restart/stale-evidence tests pass; real provider metering/stop remains pending | $0 local; background charges possible | Select attended provider monitoring/shutdown procedure before GPU run; unattended pilot remains blocked |
| Metadata/type-check blockers | Core version reconciled to `0.2.3-beta.1` using existing changelog/regressions; model registry remains experimental and non-deployable. Iterator syntax made compiler-compatible without changing public-page behavior | Full type check passes; 276 Core regressions pass | $0 | None for local fixes |
| Build advisory | Existing guarded `import.meta` fallback in production CJS build warns; real CJS selects `__dirname`, and prior exact-commit build passed. Treat as advisory, not a reason to change public routes | Existing build/boot evidence; guarded branch reviewed | $0 | None; no broad public-server rewrite |
| Privacy, live scientific quality and rollout | Existing notice can display owner contact/processors/regions/attributions. Real approved-data expert review, live OTP/callback/logout, GPU latency/two-user load and shutdown still required | Local browser flow already passed; cloud evidence absent | Included in approved pilot budget, to be measured | Approve notice/regions, then five-user canary; expand to 10–20 only after gates pass |

This table resolves local code/package defects; externally gated items remain blockers. Application shutdown stops admission, **not all provider billing**.

## Exact account/dashboard checks and configuration

### Existing host and DNS — inspect before approving changes

1. In Replit, open the existing ClimResWASH project → **Deployments/Published app** → current deployment overview and **Domains**. Record project/deployment ID, deployment type, custom-domain binding, origin hostname, Node runtime, persistent storage availability, and rollback/redeploy controls. Do not press Publish, change target or add a domain during inspection.
2. In BigRock, open `climreswash.in` → DNS management/nameservers. Export **all** records and note DNSSEC/DS. Public MX/CAA lookups returned no records, but this does not replace a complete account export.
3. After separate approval, onboard the zone to Cloudflare preserving every record, existing Replit domain binding and origin. Full-zone onboarding normally requires changing BigRock delegation; a paid/eligible partial-zone setup is an alternative to investigate, not assumed available. Use Full (strict) origin TLS and verify the public homepage/maps before routing the beta API.

### Cloudflare Access — single audience across protected paths

1. Cloudflare One/Zero Trust → **Integrations → Identity providers** → configure One-time PIN. For admins, use an approved SSO provider enforcing MFA where available.
2. **Access → Applications → Add application → Self-hosted**. Name `Bhoomi research beta`; public destinations: `climreswash.in/bhoomiai` and `climreswash.in/bhoomiai/*`. Same application/audience for both. The wildcard covers `/admin`, `/api`, chat, feedback, history, logout, health and every `/api/admin/*`; unknown/stream/tool routes remain authenticated then denied by the backend.
3. Add Allow policy with **individual approved email selectors**, never “Everyone” or an email-domain rule. Explicitly list owner/admin emails and 10–20 testers. Use a shorter admin policy/session (proposed one hour), and tester policy/session (eight hours); exclude admin emails from the longer tester policy to avoid overlap. App database roles remain authoritative for admin API access.
4. Copy the non-secret team domain and AUD to the private gateway. Authorization-cookie path must cover `/bhoomiai` and all its subpaths (root path is also suitable). Disable more-specific bypass policies. Avoid a second admin Access app/audience unless gateway verification is deliberately extended and tested.
5. After approval, Workers → create/deploy the existing API Worker with only `climreswash.in/bhoomiai/api*` route. Store `BETA_ORIGIN_KEY` as a Worker secret and gateway secret. Tunnel routes a private backend hostname to `http://127.0.0.1:5100`, with no published host ports. The backend requires **both** the origin key and the participant JWT. Do not add another Access policy on that backend hostname that replaces the participant JWT with a service identity.
6. Public host keeps `BHOOMI_BETA_GATEWAY_URL` unset for Worker topology; direct public-origin beta API requests return 503. Direct private-backend requests without origin key return 403, including otherwise valid participant JWTs. Real worker/header/cookie tests remain mandatory before invitations. Cloudflare handles `/cdn-cgi/access/*` callbacks/logout; do not route them through the API Worker.

[Cloudflare path policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [OTP setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

## First cloud test — independent of website/DNS rollout

**Proposed approval scope:** private Runpod test endpoint and small volume, original checkpoint-160 PEFT/tokenizer/template transfer, pinned public base download, transmission of synthetic prompt/tool records only, one attended GPU worker for at most 15 minutes, target spend under $1 and proposed $5 ceiling. No real datasets, training/evaluation corpus, v1.1 weights, user conversations, public URL or invitations are in scope. Approval is not recorded or assumed now.

### Runpod console steps after approval

1. Billing: inspect balance/other active resources; disable auto-pay and avoid postpaid. Set low-balance alerts. Funding/top-up is a separate financial action; deposits may exceed usage and are not a monthly hard cap.
2. Storage → **Network Volumes**: create a private volume in the approved region (e.g. 20 GB; check console availability/price). Transfer only the approved adapter artifact files to `/runpod-volume/bhoomi-ckpt160`. Include adapter weights/config, tokenizer files and the exact `chat_template.jinja`; do not transfer training/held-out data or real scientific tables. Record all hashes.
3. Serverless → **New Endpoint → custom container**: use the digest-pinned candidate in `deploy/beta/runpod_endpoint.example.json`. This specification is not a provider API payload. Published candidate is worker v2.28.0 (release reports vLLM 0.30.0); its AMD64 digest was verified from Docker Hub. v2.29.0 release notes include a token-log fix, but a stable v2.29.0 tag was not published in the inspected registry. Therefore the candidate has **no HF_TOKEN**; approved adapter files come from the private volume. Inspect actual running version/log behavior before accepting it.
4. Attach the volume, choose one 24 GB L4/A5000-class flex worker, active/min workers **0**, max workers **1**, idle timeout **5 seconds**, execution timeout **150 seconds**. Keep the worker startup timeout **180 seconds**. Inspect running/queued jobs and stop on failure; do not enable a warm always-on worker.
5. Environment: copy the pinned base/revision, BF16, 6,144 context, rank-16 LoRA, module name/path, base/tokenizer revision, `MAX_NUM_SEQS=2`, `ENABLE_AUTO_TOOL_CHOICE=true`, `TOOL_CALL_PARSER=hermes`, custom template **file path**, and remote-code disabled from the specification. No served-model alias may substitute for an actual registered LoRA.
6. Confirm unauthenticated endpoint requests are refused, then perform one authenticated `/models` warm-up. Verify the adapter ID and its base parent; inspect actual image/vLLM version and mounted adapter/template SHA-256 values. Fill a private `worker-receipt.json` using `worker-receipt.example.json`. `/models` names alone cannot prove tensor identity.
7. On the operator machine, run the existing loopback relay with endpoint-scoped `RUNPOD_API_KEY` in a protected environment, `RELAY_DAILY_REQUEST_CAP=12`, `RELAY_CONCURRENCY=1`, `RELAY_TIMEOUT_S=150`, and conservative reservation allowance. Do not expose relay/Core ports. Keep the public beta disarmed.
8. Use a separate private relay approval file following `approval.example.json`: exact endpoint/served model, pinned model hashes, owner approval and **synthetic fixture hash** from preflight as `data_bundle_sha256`. This authorises only the approved synthetic compatibility scope; it does not clear the real-data bundle. Maintain the existing recent billing/shutdown attestation. Do not invent or mark shutdown verification true until the operator has verified how to stop that endpoint/worker.
9. Set private `COMPAT_TEST_APPROVAL_FILE` and `COMPAT_WORKER_RECEIPT_FILE` paths. The compatibility approval needs scope `checkpoint-160-compatibility`, owner, future expiry and budget at most $5. Configure existing experimental environment: `NODE_ENV=research`, `BHOOMI_AI_ENV=research`, `BHOOMI_LLM_EXPERIMENTAL=1`, `BHOOMI_LLM_BACKEND=openai_compat`, original registry/model IDs, pinned served model, loopback relay base URL. The existing factory still rejects production/accepted-gate violations.

```sh
# Safe now: hashes/config only; no model/network inference.
python3 deploy/beta/compatibility_probe.py

# ONLY after the separate approval and secure operator configuration above:
python3 deploy/beta/compatibility_probe.py --run --report /tmp/bhoomi-real-compatibility.json
```

The probe uses the real model for tool selection and a normal verified answer; then injects an invalid draft to test deterministic fallback using the same Core verifier. It requires native parsed calls for Kota/Rajasthan and the correct synthetic figure, refuses the Jaipur mismatch, uses a 90-second turn budget, and records `synthetic_data=true`. A failure does not permit substituting a base model, modifying scientific formulas, relaxing the verifier or accepting the registry entry. This is protocol/runtime compatibility, not independent scientific acceptance or a quality claim.

10. Immediately disable the endpoint, check queued/running jobs and worker count, verify compute stops, and record actual billing delta/latency/logs. Preserve only local evidence; decide separately whether to retain the volume (storage billing continues) or delete it after recovering approved artifacts. Do not leave the test unattended.

The worker supports LoRA and custom template/parser configuration, but this exact CUDA combination remains untested. The adapter template uses Hermes-style `<tool_call>` JSON; this supports the parser choice, not proof it works on a GPU. [Worker configuration source](https://github.com/runpod-workers/worker-vllm), [vLLM parser documentation](https://docs.vllm.ai/en/latest/features/tool_calling/), [worker release notes](https://github.com/runpod-workers/worker-vllm/releases).

### Cost and continuing charges

Current published flex rates: L4/A5000 class **$0.69/hour**; 4090 **$1.10/hour**. Fifteen billable minutes is approximately $0.17/$0.28 GPU-only; allow startup/retries for a **$0.20–$1 expected first test**, with a proposed **$5 attended ceiling**, not a guaranteed account hard limit. At $0.07/GB-month, a retained 20 GB network volume is $1.40/month. Taxes/FX and any credit top-up are separate. [Prices](https://www.runpod.io/pricing), [billable phases/storage](https://docs.runpod.io/serverless/pricing).

After application pause/shutdown, already dispatched jobs, worker model loading, active/min workers and idle tails may still bill. Network volumes/container storage, the CPU host and backups can continue billing independently. A local quota, closed browser or stale billing-file gate stops **new dispatch**, not provider-side work already running. Operator/provider stop and observed billing reconciliation are required before unattended service; this audit does not certify a provider-wide hard cap.

## Secrets and permissions you configure

- Read-only access to the actual Replit deployment/domain and BigRock zone is needed to confirm architecture. No source/dashboard access was silently fabricated.
- Configure Cloudflare issuer/AUD, Worker origin key, tunnel credential, gateway HMAC key, operator ID and persistent storage using secret managers or protected mode-0600 environment files. CF API automation, if later approved, should have only needed Access application/policy and scoped Worker/Tunnel/zone rights; avoid global keys.
- Configure a restricted Runpod endpoint key for the relay. The GPU candidate receives no HF token. Volume transfer credentials stay in the operator's secret environment; no keys appear in prompts, command-line values, Git or public host/Worker.
- Place actual approval, receipt and billing files in `deploy/beta/private-state/` for the read-only directory mount. Bind a directory rather than individual billing files so atomic replacements become visible. Synchronise gateway clock before strict JWT testing.

## Rollout and rollback without public-site disruption

1. Complete the isolated GPU test first; no domain changes are needed for it. Then approve data, privacy/regions, persistent CPU host and monitored spend controls separately.
2. Release from an isolated reviewed checkout of the beta commits/audit changes, not the current dirty working tree. Preserve public route behavior and origin binding; establish a current public-route baseline before deployment.
3. After approved Cloudflare onboarding, verify the existing homepage/maps/forecast/public admin first. Add only the private path policies and API Worker route. Use owner plus two testers for live OTP, callback/logout, direct-origin, revocation and model/data checks.
4. Invite five testers, then 10–20 after review. For each exact email: approve → Access exact-email policy → database CLI/dashboard invite → set quota 20 → separately approved invitation email. Revoke in the database first for immediate denial, then remove policy/revoke Access sessions.
5. Emergency: persistent gateway pause → disarm cloud approval → stop relay/Core and provider endpoint/jobs → verify workers stopped and billing stops → deny beta Access if needed. Keep encrypted feedback/audit for review.
6. Roll back only `/bhoomiai/api*` Worker routing and beta release; keep public origin/DNS intact. Any delegation reversal needs separate approval and the saved complete DNS/DS state. Never delete usage/reservation databases to regain allowance.

Existing launch/validation documents remain historical evidence. This audit adds current fixes and clearly leaves live authentication, approved-data science, actual GPU compatibility and provider shutdown as release gates.
