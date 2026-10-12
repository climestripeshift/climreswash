# Bhoomi AI invitation-only research beta — implementation plan

Prepared 12 October 2026.

**Integration update:** the participant URL is now required to be `https://climreswash.in/bhoomiai`, inside the existing React application. The separate participant hostname/build recommendations below are historical and superseded by `BHOOMI_BETA_LAUNCH_CHECKLIST.md`, which documents the current same-domain architecture and local implementation.

 Scope: 20–50 invited climate, GIS and WASH professionals, for 30 days. This document resumes the existing local scaffold. **No deployment, model/data upload, paid GPU, invitation email, or production configuration change is authorised by this plan.**

## Recommendation and readiness

Keep the existing React chat, Bhoomi AI Core v0.2.3 scientific tools, verifier and experimental registry. Finish the separate beta gateway and build rather than rebuilding ClimResWASH. Use Cloudflare Access email authentication and Tunnel in front of a small dedicated CPU host, with private local Core workers and a controlled relay to Runpod Serverless.

Preferred inference candidate: the pinned Qwen3-4B-Instruct-2507 base in BF16 plus the original checkpoint-160 PEFT adapter on a 24 GB flex worker. The existing llama.cpp Q4_K_M + GGUF LoRA remains a local comparison runtime. Neither cloud runtime compatibility nor scientific parity has been demonstrated on an actual GPU. Invitees must not be admitted until the gates below pass.

The scaffold has good foundations, but is **not ready to launch**. The most immediate blockers are the inherited production environment conflicting with the experimental gate, incomplete model/provenance records, unapproved dataset licensing, and controls that measure gateway elapsed time rather than provider billable GPU time.

## 1. What is already reusable

| Requirement | Existing work | Remaining work |
| --- | --- | --- |
| Chat and scientific tools | `BhoomiAIChatPage.tsx` supplies shared assistant rendering; `BhoomiBetaPage.tsx` adds the beta shell; Core owns tool execution and verification | Reuse rendering and response semantics; make unavailable cloud capabilities explicit |
| Isolated application | `server/betaServer.ts`, `vite.beta.config.ts`, `client/beta/`, separate `/api/beta/*` routes | Verify the packaged application end to end; do not import production route registration |
| Authentication | Access JWT signature/issuer/audience/expiry validation; gateway email allowlist; admin role; local-only dev auth | Configure Access policies later; MFA for administrators; revocation and expiry tests |
| Research consent | Versioned consent and separate optional training checkbox, off by default | Retention, withdrawal/deletion, contact, processors and storage-region notice |
| Feedback | Thumbs up/down, incorrect figure, wrong geography, incomplete answer, unclear explanation, correction and other categories | Preserve immutable consent/model/provenance snapshots; abuse limits on feedback/admin writes |
| Administration | Filters, review statuses, CSV/JSONL exports, invitation allowlist, suspension API, usage and pause control | Model/date filter controls, pagination and complete exports, suspension UI, durable pause state |
| Storage | SQLite WAL for invitations, interactions, feedback, review, usage and audit | Encryption, backup/restore, retention, schema constraints and provenance completeness |
| Cloud data boundary | `cloud_beta` profile replaces restricted/unclassified tools with inert stubs and blocks restricted data reads | Independent source approval manifest; validate every record and derived field |
| Deployment preparation | Compose, Dockerfile, entrypoint, Runpod endpoint specification, relay and local bundle builder | Resolve blockers; pin dependencies/images; reproducible build and local smoke test |

All existing working-tree edits belong to the prior work/user. This continuation changes no existing application or production files.

## 2. Hosting architecture

```text
Invited browser
  -> Cloudflare Access (exact email allowlist; email OTP / approved SSO)
  -> Cloudflare Tunnel (HTTPS hostname; no inbound origin ports)
  -> beta Express gateway + beta React build
       -> beta SQLite on encrypted persistent storage
       -> 1–2 loopback Core workers (cloud_beta; tools + verifier)
            -> loopback inference relay (pinned model and upstream)
                 -> private Runpod Serverless endpoint (API key)
```

Use a separate beta hostname, host, storage, secrets and deployment project. Keep the public ClimResWASH website, production database, production server, local Qwen2.5 fallback and registry entries unchanged. Never mount the full repository or host filesystem into the hosted container. The GPU receives user prompts and approved tool excerpts; it receives no scientific data files or feedback database. Prompt excerpts are still disclosures to a cloud processor and require source clearance.

For this scale, one gateway instance and SQLite are reasonable. Two Core processes can serve two independent turns; sessions remain pinned to a worker. Do not scale the gateway horizontally while its session ownership, concurrency and short-window quotas are in memory. Move those controls to shared durable storage first if multiple gateways become necessary.

Start with zero active GPU workers and one maximum flex worker. Permit two chats only after testing their model-call contention and memory use. A second GPU worker requires a revised budget and separate approval. Busy clients receive a clear retry response; do not create an unbounded queue.

## 3. Verified inference options and uncertainties

The exact local runtime record is `research/bhoomi_llm_v1/runtime_experimental/RUNTIME.json`: Qwen/Qwen3-4B-Instruct-2507 revision `cdbee75f17c01a7cc42f958dc650907174af0554`, rank-16 adapter with attention and MLP target modules, 6,144-token context. Training used NF4 QLoRA; the local runtime uses an Ollama Q4_K_M base whose source revision is not recorded, plus an F16-converted GGUF adapter. These are material differences, not interchangeable validation results.

Runpod documents the OpenAI-compatible endpoint route and `MODEL_REVISION`, `ENABLE_LORA`, `MAX_LORA_RANK` and `LORA_MODULES`. vLLM lists Qwen3 with LoRA support and selects a registered adapter through the request model name. These establish a supported configuration candidate, **not proof that this particular adapter loads or retains its training chat template**. [Runpod configuration](https://docs.runpod.io/serverless/vllm/environment-variables), [API route](https://docs.runpod.io/serverless/vllm/openai-compatibility), [vLLM supported models](https://docs.vllm.ai/en/latest/models/supported_models/), [LoRA serving](https://docs.vllm.ai/en/latest/features/lora/).

| Option | Assessment |
| --- | --- |
| Runpod vLLM, original PEFT adapter + pinned BF16 base | Preferred benchmark candidate. Approximately 8 GB for base weights before adapter, KV cache and engine overhead; 24 GB is a planning choice, not a measured requirement. Pin tokenizer, template, engine and image digest. |
| Custom Runpod llama.cpp worker, existing GGUF base + GGUF LoRA | Alternative if retaining the local runtime is essential. Requires a custom handler, pinned llama.cpp build and CUDA validation; the supplied vLLM relay/template does not implement this option. |
| GGUF base + GGUF LoRA on stock vLLM | Do not assume support. vLLM describes GGUF as experimental and potentially incompatible with other features. [GGUF documentation](https://docs.vllm.ai/en/v0.18.0/features/quantization/gguf/). |
| Modal custom worker | Alternative if Runpod cold starts/availability are unacceptable. Requires a different deployment and relay integration; compare actual billable time, not just hourly GPU rates. |
| Dedicated Runpod Pod | Useful for an approved, scheduled benchmark. Continuous 720-hour operation is less attractive for an intermittent pilot. |

The Qwen3-4B-Instruct-2507 model card identifies Apache-2.0. Keep required licence/notice material and separately inspect adapter training provenance. A base-model licence does not clear the datasets or corrections. [Qwen model card](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507).

Before any GPU test: approve exact upload artifacts, provider, region and a small benchmark budget. Then confirm adapter presence and selection, all target modules, template/tokenizer checksums, tool-call parser behaviour, deterministic outputs, context limits, latency and memory. Fail startup if the adapter is missing; never silently serve the base as Bhoomi-LLM. Qwen2.5 remains available locally; any future hosted fallback needs its own explicit version label and separately approved configuration.

## 4. Authentication and email invitation design

Administrator adds an address to the beta database and an exact-email Access policy. A human-approved invitation email contains the beta URL, expiry, purpose, privacy notice and support contact. Access sends a one-time PIN at sign-in; invitation creation in the current dashboard **only updates the database and sends no email**. [Cloudflare email OTP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

Protect the entire hostname, including static assets, admin routes and health, with a default-deny policy and no bypass rule. The gateway independently validates the Access JWT and checks invitation/suspension on every request. Add invitation expiry and immediate suspension; revoke both gateway access and Access sessions. Use short sessions (proposed: eight hours for users, one hour for admins), and SSO with MFA for admin identities. Test origin bypass, spoofed headers and role escalation.

Cloudflare publishes a free plan for up to 50 users; count administrators and other seats too. For a free pilot, target 20 initially and at most 48 participants plus two admins, subject to existing account usage. Fifty participants plus admins may exceed that allowance. [Cloudflare free services](https://blog.cloudflare.com/shields-up-free-cloudflare-services-to-improve-your-cyber-readiness/). Confirm current seat entitlement before activating an account.

## 5. Research notice, privacy and licensing

Display “Bhoomi AI — invitation-only research beta”, “Bhoomi-LLM v1, checkpoint-160”, Core version, runtime version and a verification badge per answer. Explain that verification checks supported figures against tools; it does not establish overall truth, dataset quality or expert approval. State geographical/temporal coverage, stale data, missing datasets, synthetic training limitations and that outputs must not guide operational or life-safety decisions without independent review.

Before admission, finalise an owner/contact and plain-language privacy notice covering:

- Email for access control; pseudonymous interaction IDs; prompts, answers, feedback, model identity, verification and tool provenance for research evaluation. Pseudonymisation is not anonymisation: text can contain identifiers.
- Named processors (Cloudflare, CPU host, Runpod and any private model-artifact host), storage/processing regions, subprocessors and provider logging/retention terms. Do not promise zero provider retention without evidence.
- Proposed retention: delete identifiable prompts, answers, feedback, Core traces and access records 90 days after pilot close; rotate/delete backups within 30 further days. Preserve only reviewed, de-identified aggregate findings unless separately authorised.
- Contact-based withdrawal/deletion process, training-consent revocation and deletion from active databases, exports and backup lifecycle. No personal/confidential information should be entered.
- Separate optional future-training consent, off by default. Refusing it must not block research participation.

Create an artifact/source clearance manifest with source owner, licence/terms URL and version, permitted hosted processing, redistribution/derived-field rights, attribution, checksum and recorded approval. Existing `allowed_with_attribution` labels came from a training policy; **they do not themselves approve cloud deployment**. Review NFHS-5/JJM aggregates, ERA5, WorldCover and all mixed/derived hex fields. Attribution must be visible in the beta; filesystem-source sanitisation must not remove required notices.

Keep CHIRPS-derived monsoon/rainfall outputs, IFI flood inventory, provisional LGD crosswalks, forecast snapshots and any unresolved sources out unless explicitly approved. This is the project's restriction; do not claim every named source is universally prohibited. Disable tools using unresolved mixed sources, including WASH if its clearance remains open. Inspect trained-adapter provenance as well: excluding a source file does not prove its values are absent from weights.

## 6. Feedback records and administrative review

Retain current feedback taxonomy and suggested corrections. Every interaction needs an immutable record of: interaction/session ID, pseudonymous user, UTC time, question and displayed answer, registry model ID and status, base revision, adapter checksum, template checksum, inference engine/image, Core/verifier/prompt versions, deployment profile, verification outcome/violations, tool names/validated arguments/status, source artifact hashes/licence versions, latency, fallback/repair flags and consent version/time at submission.

Keep detailed provenance server-side; provide public source titles, approved attribution and limitations in the response. Never expose internal paths, tool exception strings, raw prompts, private traces or local debug information. Preserve error/timeout interaction IDs with minimal audit records too, so failed turns can receive useful feedback.

Dashboard: filter by model version, date range, rating, category, verifier outcome and review status; show answer and evidence together; paginate; export all matching rows with explicit counts, CSV formula protection and download audit. Current store limits exports to 1,000 rows, so complete export needs cursor/batch handling. Review states remain new, triaged, confirmed issue, not an issue, needs expert, candidate for training review and rejected for training.

No training pipeline reads this database or export automatically. “Candidate” only queues human review. Any future training artifact requires an explicit release record listing eligible interaction IDs, valid non-revoked consent, reviewer, correction evidence, licence/provenance approval, redaction, held-out evaluation contamination check and dataset hash. Keep `training_use_authorized=false` for ordinary exports. A thumbs-up or verified figure is never training authorisation.

## 7. Security and deployment blockers to resolve locally

| Priority | Observed gap | Required preparation |
| --- | --- | --- |
| P0 | Docker/env template sets `NODE_ENV=production`; entrypoint passes it to Core; `experimental.py` refuses it | Separate gateway production environment from Core research-beta process environment. Preserve the registry gate, loopback requirement and `deployable=false`; test both production rejection and beta startup. Do not change registry acceptance. |
| P0 | Gateway replaces the returned model with a generic label; transport also drops adapter/prompt/source detail | Persist trusted runtime identity before public shaping; validate it against configured approved beta artifacts. |
| P0 | Bundle check inspects restricted-looking keys only in the first hex record and skips large text content scans | Validate every record/field and source lineage; reject symlinks/unapproved files; require licence manifest. Keyword scans are supplementary. |
| P0 | Gateway budget is elapsed request seconds, not provider GPU billing; relay cap and pause switch reset on restart | Durable reservation/counters, persistent pause, provider usage reconciliation and fail-closed monthly ceiling. |
| P0 | Aborting gateway HTTP does not establish that synchronous Python or Runpod execution stops | Carry a total turn deadline across Core/model calls; test cancellation and provider execution timeout. Keep capacity reserved until work is known to have stopped. |
| P0 | Only evidence string is path-sanitised; answers/notes/trace errors can still include internal information | Separate approved public DTO from private provenance; test every response field, including failures and prompt-injection probes. |
| P1 | Compose volume ownership may not permit UID 10001 writes; two Cores share a cache/feedback directory | Test fresh-volume permissions, WAL contention and backup consistency; isolate Core writes where appropriate. |
| P1 | Core default is 20 sessions per process; pinned sessions can cluster; gateway can select an already-busy pinned worker | Capacity-aware scheduling, user-visible session expiry/recovery, TTL ownership cleanup; prove support for 50 invitees with two active turns. |
| P1 | Generic JSON/error middleware, optional origin configuration and loosely parsed numeric limits | Require hosted origin, validate positive bounded config, classify 400/413 errors, apply strict write origin/CSRF policy and mutation limits. |
| P1 | Container images/dependencies are not reproducibly pinned; Core private logs duplicate gateway storage | Lock versions/image digests; prevent prompt/key logging; include every store and backup in retention/security controls. |

Use encrypted disks/backups and TLS. SQLite is not encrypted by the current code. Store keys separately, restrict host access, disable core dumps, apply least-privilege credentials and firewall outbound traffic to required processors. Never publish Core/relay/debug ports; no tools accept browser-selected filesystem paths or arbitrary URLs.

## 8. Quotas, timeouts and spending safeguards

Proposed initial limits: 3 chat turns/minute, 20/hour, 40/day/user; 400/day globally; one active turn/user; two active turns total after benchmarking; 1,000 input characters; 600 output tokens/model call; 6,144 total context tokens with preflight counting. Bound tool steps and repair calls so a chat cannot generate unlimited model requests.

Choose final timeouts from measured cold/warm latency. A starting candidate is a 120-second whole-turn deadline with shorter per-call remaining-time limits and a compatible provider execution limit. The present 120-second gateway versus 150-second relay plus 240-second Core timeout is not coordinated.

Reserve quotas and conservative compute allowances atomically before dispatch; reconcile after completion. Enforce daily and monthly caps in durable storage, including failures, retries and abandoned requests. The proposed 7,200 daily seconds in the template must be labelled an estimate until tied to worker billing. Add a persistent owner pause plus a provider shutdown procedure.

For the approved pilot, propose a $100 GPU spending target, alerts at $50/$75/$90 and automated dispatch stop at $90, with a separate contingency ceiling. Disable auto-pay/recharge, avoid postpaid billing and start with zero active/one maximum worker. Monitor actual billable starts, execution and idle time. Runpod documents prepaid credits and auto-pay, but its zero-balance stop description is specifically about Pods; **do not call prepaid balance a proven hard Serverless cap**. Confirm endpoint shutdown/billing behaviour before relying on it. [Runpod billing](https://docs.runpod.io/accounts-billing/billing).

## 9. Estimated 30-day budget

Rates checked 12 October 2026: Runpod Serverless flex 16 GB $0.58/hour, 24 GB L4/A5000/3090 class $0.69/hour, RTX 4090 $1.10/hour. [Runpod pricing](https://www.runpod.io/pricing). Serverless bills worker start/model loading, execution and idle tail; download/cached-image time before worker start is distinguished from billable startup. [Billing phases](https://docs.runpod.io/serverless/pricing).

Planning assumptions, not benchmarks: 3,000 turns × 45 seconds effective billable GPU time = 37.5 hours; 10,000 turns × 60 seconds = 166.7 hours. Effective time includes allocated start/idle overhead and multiple calls per turn; concurrency may reduce it, repeated cold starts may increase it. Recalculate after the approved benchmark.

| Item | Moderate use | Heavy use |
| --- | ---: | ---: |
| L4/A5000-class flex GPU | $26 | $115 |
| RTX 4090 flex alternative | $41 | $183 |
| CPU host, encrypted storage/backups | $15–30 allowance | $15–30 allowance |
| Model cache/artifact storage | $2–5 allowance | $2–5 allowance |
| Access/OTP | $0 if within free seats | $0 if within free seats |
| Approved compatibility benchmark | $5–10 allowance | $5–10 allowance |
| Approximate total with contingency | **$60–110** | **$165–275** |

CPU/artifact allowances are estimates rather than vendor quotations. Domain registration, tax, card/FX fees, reviewer labour and paid Access seats are excluded. Recommend proposing **$150 total funding**, with $100 earmarked for GPU and stricter usage caps; heavy-use expansion needs a new budget. A runaway 4090 flex worker running all 720 hours would cost $792 GPU-only, so maximum-worker count alone is insufficient.

Modal lists L4 at $0.000222/second (about $0.80/hour), with additional CPU/memory charges; investigate only if measured availability/cold starts justify another integration. [Modal pricing](https://modal.com/pricing). No credits or discounts are assumed.

## 10. Test plan and release gates

| Area | Required evidence before admitting invitees |
| --- | --- |
| Authentication | Valid OTP/SSO login; uninvited/suspended/expired accounts denied; forged/expired/wrong-audience JWT rejected; admin access isolated; immediate revocation; no origin bypass |
| Security | CSRF/origin, XSS/Markdown/link safety, SQL/CSV injection, body limits, secret redaction, SSRF/path traversal, prompt injection and tool misuse; response-field leakage probes; no debug/log/filesystem endpoints |
| Privacy/licensing | Exact approved source/artifact manifest; unresolved files/derived values excluded; attribution displayed; consent snapshots, withdrawal and deletion across both databases, exports and backups |
| Scientific correctness | Golden tool results for figures, units, dates, geography and aggregation; ambiguous places require clarification; unavailable tools refuse explicitly; fabricated/stale/unsupported answers cannot receive a misleading verification badge |
| Runtime parity | Pinned BF16+PEFT versus local GGUF+LoRA on development cases; adapter selected; template/tool JSON/repair behaviour; bounded context; registry production rejection preserved. Do not reuse held-out evaluation data as training feedback. |
| Multi-user load | Local mocked 20 and 50 distinct identities; bursts of 2/5/10 submissions; real inference load only after approval. No cross-user history, duplicate/lost records, unbounded queues or quota overspend. Restart/cancellation/worker death tests. |
| Operations/cost | Clean-volume boot; encrypted backup restoration; durable pause/caps; provider billable-time reconciliation; timeout cannot leave unbounded work; endpoint shutdown and rollback rehearsal |

Proposed initial acceptance: zero auth/isolation/leakage failures; all mandatory scientific safety cases pass; supported answers show correct numeric values/units/place/period and accurate verification status; two active users served without shared history; busy users get prompt retry feedback. Measure warm p95 latency and cold-start latency before setting user promises (candidate warm target: under 60 seconds). An expert reviews representative climate/GIS/WASH cases before the pilot; model-eval scores alone do not replace that review.

## 11. Milestones and approval boundary

| Milestone | Estimate | Deliverable / exit condition |
| --- | --- | --- |
| M0 — handoff audit and plan | Complete for this continuation | Scaffold inventory, documented blockers, hosting research, baseline checks |
| M1 — local hardening | 2–4 working days | P0 fixes, immutable identity/provenance/consent, durable controls, strict response boundary and passing local regressions |
| M2 — packaging and research review | 1–2 days plus source-owner response time | Reproducible clean bundle; independent licence/attribution approvals; privacy text, retention/deletion and backup restore checked |
| M3 — approved private GPU benchmark | 1 day after separate approval | Exact adapter/template/config tested, parity/latency/memory/cost report, final GPU choice; no invitees yet |
| M4 — approved private hosting and five-person canary | 1–2 days after separate approval | Access/OTP/admin MFA, operational controls, incident/shutdown rehearsal; permission to send named invitations |
| M5 — 20-person cohort, then up to seat limit | 30-day pilot | Weekly expert feedback triage; monitor costs/latency/errors; expansion only after stable first week |
| M6 — close and review | 1–2 days | Disable access/GPUs, report aggregate findings, delete under retention policy; no automatic training or public launch |

Before M3/M4 the owner separately approves the exact model/data artifact manifest, provider/region, benchmark and pilot ceilings, privacy/contact/retention choices, isolated hostname/host and named invitation cohort. No approval is requested merely to write this plan or perform safe local preparation.

Existing configuration files under `deploy/beta/` are **draft specifications**, not a validated deployable release. In particular, `runpod_endpoint.example.json` is not a direct provider API payload. Do not execute Compose, push images, publish the bundle, upload weights, add funds or activate DNS/tunnels from this plan.

## 12. Baseline validation performed during continuation

- Beta gateway: 19/19 existing tests passed using temporary loopback mock services. Sandbox initially blocked socket binding; an authorised local test rerun succeeded.
- Existing Bhoomi bridge: 28/28 tests passed.
- Bundle/relay Python suite: 12 tests passed; resource cleanup warnings remain in relay test fixtures.
- Core cloud-profile and experimental-gate tests: 22 passed.
- `npm run build:beta` succeeded and produced the separate beta output.
- Local bundle assembled: 61 files, 27.1 MB. Checker refused it because the placeholder `BETA_HASH_KEY=CHANGE_ME_32_PLUS_RANDOM_CHARS` matches its secret pattern. This is a placeholder false positive; fix narrowly without weakening real-secret detection. The bundle remains unapproved for upload and has not been uploaded.
- Repository-wide `npm run check` reported one error outside the beta scaffold: `client/src/pages/HexMapV2Page.tsx:2277`, TS2802, iteration over `MapIterator` with the current compiler target. No beta file errors were reported; the full repository check is not clean. This continuation leaves that unrelated file unchanged.
- No GPU inference, cloud compatibility/load test or browser end-to-end verification was performed.

Passing scaffold tests establish a useful baseline; they do not cover all launch blockers listed above.
