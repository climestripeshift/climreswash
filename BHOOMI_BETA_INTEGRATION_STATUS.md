# Bhoomi AI beta: integration status after the A40 compatibility PASS

12 October 2026. Local, zero-cost work only. **No GPU, upload, Replit secret, publish, DNS or paid change was made.** Not a launch authorization.

Baseline fact: the pinned `vllm/vllm-openai:v0.30.0` image loaded Qwen3-4B-Instruct-2507 + the original checkpoint-160 LoRA and made native tool calls on an A40 Pod in CA-MTL-1 (`reports/bhoomi_gpu_compatibility/2026-10-12/a40-montreal/FINAL_RESULT.json`). Nothing below repeats that test.

## 1. What was built and tested

```
browser -> Replit Express (same-origin proxy, existing site untouched)
        -> gateway (code login, consent, quotas, kill switch)           [PostgreSQL bhoomi_beta]
        -> Core (cloud_beta profile, permitted data, verifier)          [no provider credentials]
        -> relay 127.0.0.1 (pinned URL + pinned model, identity checks, approval/billing/budget gates)
        -> Runpod:  B) Serverless  https://api.runpod.ai/v2/<id>/openai/v1
                    A) Pod         https://<pod>-8000.proxy.runpod.net/v1  (authenticating gate in front of vLLM)
billing_monitor (beside the relay) -> provider read-only billing + shutdown evidence -> relay (must be <= 300 s old)
```

| Piece | Change | Evidence |
| --- | --- | --- |
| Relay (`deploy/beta/runpod_relay.py`) | Second upstream kind (Pod proxy) with its own credential, never the account key; every chat response must name the pinned model; `/v1/models` must list the pinned LoRA with the pinned base as `parent`; any mismatch fails closed and persists a pause; verified `/v1/models` is cached so Core's per-turn lookup never wakes or bills the GPU | 16 relay tests (6 new), Python 3.11 |
| Billing monitor (`deploy/beta/billing_monitor.py`) | New. Nothing on an ephemeral replica produced the relay's required <=300 s billing evidence. Read-only provider calls; one opt-in action (stop the approved Pod on a spend/uptime breach); fails closed by going stale | 12 tests, including relay acceptance of its output |
| Supervisor (`server/beta/supervisor.ts`) | Approval manifest from a Replit secret (env var, not a file); Core's data directory fixed (see 2.1); Core model settings derived from the relay's; per-child least-privilege credentials; monitor launched | 6 tests (3 new) |
| Core | Reports `served_parent` and `relay_identity_verified`; both reach the gateway's identity comparison | 276 Core tests, Python 3.11 |
| Gateway | Honours the relay's persistent pause at admission (nothing reserved); operator resume clears both stops; raw provider errors never shown | PostgreSQL test (new) |
| Pod gate (`gpu-compatibility/pod_gate.py`, `start-pod-proxy.sh`) | See 2.2 | 6 unit + 9 Docker/CPU checks |
| Serverless spec + baked-adapter image recipe | Updated with verified engine evidence | Image digest and engine build verified on Docker Hub |

**Real-stack run** (`tests/runBetaRealStackE2E.py`, report `reports/beta_real_stack_e2e_2026-10-12.json`): disposable PostgreSQL + the real gateway + Core started from the supervisor's own launch spec + the real relay + a fault-injection proxy + the actual checkpoint-160 model served locally by llama.cpp, using the repository's permitted data. Only the GPU provider is absent (and therefore the relay's approval/billing gate, which has its own tests).

## 2. Defects found by this work (all fixed locally)

1. **Core could not start under the supervisor.** `cloud_beta` requires Core's data directory inside its own `data/` root; the supervisor defaulted to `/tmp/bhoomi-core`. Core would raise `AccessError`, be retried three times, and the beta would stay unavailable. No earlier test launched Core through the supervisor.
2. **Pod behind Runpod's proxy with only `--api-key` is not private.** vLLM 0.30.0 documents that `--api-key` guards `/v1`, `/v2`, `/inference` only; `/invocations` exposes the same inference unauthenticated. An in-Pod authenticating gate is required for Option A.
3. **Nobody produced the relay's billing evidence** on Replit (a file that must be <=300 s old). Without it the relay denies every call.
4. **Core's per-turn model lookup reached the paid upstream.** Each question would add a billed `/models` call and a relay budget reservation, and wake a Serverless worker.
5. **Core held provider credentials** (inherited environment) although it executes model-selected tools.
6. **An identity refusal surfaced as an HTTP 200 answer** containing raw "HTTP Error 502: Bad Gateway", and the gateway kept admitting (and reserving quota for) requests that could not be served.
7. Replit secrets are environment variables; the approval manifest was only accepted as a file path.

## 3. Option A (Pod) versus Option B (Serverless)

| | A. Pod + gate | B. Serverless worker |
| --- | --- | --- |
| Engine verified | Exact image and flags that PASSED | Same vLLM build (commit `ced6857a`) and CUDA 13.0.2 inside the worker image; **worker wiring unverified** |
| Private by | In-Pod gate: edge key, 2-route allowlist (tested) | Runpod account authentication on `api.runpod.ai`; no public unauthenticated route |
| Adapter delivery | Attended `scp` over SSH (done before) | Bake into image (needs a registry account + upload) or a network volume |
| Scale to zero | No: bills until stopped; needs the stop watchdog/monitor | Yes (`workers_min=0`) |
| Cost basis (catalog reads 2026-10-12) | A40 Secure $0.59/h: 4 h/day = $2.36/day; always-on = $14.16/day | A40 flex $1.22/h active only |
| Estimate for 100 turns/day in ~10 bursts | $2.36/day (4 h supervised) | ~$0.70/day (10 cold starts x ~$0.026 + 100 x ~7 s x $1.22/h + 10 x 60 s idle) |
| Main risk | Operator must start/stop; Cloudflare 100 s proxy limit | A40 stock LOW (requests queue); cold start unmeasured on Serverless; worker template/LoRA wiring |
| Smallest path to ONE live answer | Yes: reuses the verified procedure, no third-party registry | Needs a separate worker compatibility test first |

The estimates use latencies measured on the A40 Pod (tool call ~3 s, follow-up ~3.7 s, cold start 78 s eager) and the catalog prices; Serverless numbers are not measured.

**Recommendation:** use A for the first supervised answer(s) and the owner-only phase; adopt B for the invited rollout after one small Serverless worker test passes. Both use the same relay, monitor, gateway and identity gates.

## 4. Remaining gates (none started)

1. Replit: Publishing machine size/replicas, `BETA_*` secrets, `git pull --ff-only`, Publish (all separately approved). Memory: ~115 MiB Core + relay + monitor per replica (offline Linux measurements earlier); live load unmeasured.
2. Live checks that cannot be done locally: custom-domain cookies/proxy, direct-origin denial, the Neon runtime role under the published runtime, `BETA_DB_TRANSPORT`, Replit's Python 3.11 with `psycopg`.
3. The relay's approval manifest, billing monitor key, `MONITOR_AUTOPAY_DISABLED` attestation, spending alert.
4. Data/privacy/processor approvals recorded in the manifest (regions: the A40 test used CA-MTL-1).
5. Owner-only login first; then a small invited cohort with the existing quota/revocation controls.

## 5. Test environments (what runs where)

| Suite | Needs | Notes |
| --- | --- | --- |
| `npm run test:beta`, `tests/betaSupervisor.test.ts`, `npx tsc --noEmit` | checkout + `npm install` | no external services |
| `python3 tests/runBetaPostgresTests.py` | Docker `postgres:16`, Python with `deploy/beta/requirements-postgres.txt`; a fresh `dist/index.cjs` for the production-start test | disposable local database only |
| `deploy/beta/test_*.py` (relay, spend controls, billing monitor, probe, bundle) | stdlib only; run from `deploy/beta`. `deploy.beta.test_portable_core` runs from the repository root | |
| `deploy/beta/gpu-compatibility/test_pod_gate.py` | stdlib only | |
| `test_pod_proxy_local.py`, `test_startup_local.py` | Docker image built from `Dockerfile.cpu-test` (`bhoomi-ssh-wrapper-cpu:test`) | CPU only, stub vLLM |
| `tests/runBetaRealStackE2E.py` | Docker + a loopback OpenAI-compatible model server (`LOCAL_MODEL_URL`, default `http://127.0.0.1:8081/v1`) | zero cloud cost |
| Core `research/bhoomi_ai_core_v0/tests` | `PYTHONPATH=src`; **the verifier, agent, tool and v0.2 suites also need the licence-restricted research outputs and the frozen eval judge, which are deliberately not in Git** | In a clean checkout 28 fail and 8 error for that reason alone. They pass locally (276). The `cloud_beta`-relevant suites (profile, LLM factory, experimental, deadline, platform, registry, v0.2.3) pass from tracked files only. |
