# Bhoomi AI showcase: one supervised demo

Implementation is local and OFF by default. No GPU was started, no secret changed, and nothing published.

Existing PIN/admin login and same-origin proxy → `/bhoomiai/api/demo/chat` → authenticated Runpod Pod gate → Bhoomi-LLM v1 checkpoint-160. The existing research `/api/chat` route, approval manifest gate and Core verifier are unchanged. Demo activation refuses simultaneous co-located research inference; it starts only the already-existing Express gateway, without Core, relay or billing-monitor processes.

The real model selects read-only `district_hazard_profile`, `method_notes`, or `describe_capabilities` tools. The backend supplies results, makes a second model completion, and displays deterministic tool-backed results and approved explanations. Generated prose is deliberately not displayed: this narrow showcase demonstrates conversation context and real model tool selection without accepting unsupported scientific claims. Only SYNTHETIC District Alpha in SYNTHETIC State exists. Real places, WASH records, forecasts, documents, restricted data, file access and writes are unavailable. Demo output is never labelled scientifically verified.

All answers and the chat notice show **DEMONSTRATION DATA — invented synthetic values; not real observations or validated predictions.** Synthetic scores are not probabilities. No research consent, feedback, interaction or training record is created. Questions/context are sent to Runpod for inference and kept in bounded gateway memory (two completed turns, up to 100 conversations, 30-minute expiry). Production research consent and record handling remain untouched.

The approved archive is unchanged:
`deploy/beta/owner-launch/bhoomi-owner-SYNTHETIC.tar.gz`
SHA-256: `3e5ea5c9f67c82fb24e2578793dd87c073104242512bb3d7364f9410b7c274a5`.
The gateway checks the archive, pinned overlay manifest digest and every overlay file before loading synthetic values. Keep the archive and `synthetic-bundle/` directory in the **server** checkout, never a public asset directory.

Limits: **one global active question, six questions/minute, thirty questions total**, shared across PIN users, administrators, replicas and restarts through the existing PostgreSQL settings/transaction lock. Each question permits at most three read-only calls and two model completions; the entire request has a 90-second deadline. No automatic inference retries. Endpoint redirects are refused; responses are capped at 64 KB; only fixed result fields reach the browser. Unknown tools, bad model identity, upstream failures, timeouts and uncertain expired leases latch the durable demo-off switch. Browser conversations are user-bound. Emergency off aborts requests in that gateway; other replicas discard results when they observe off. Aborting HTTPS does not guarantee cancellation of GPU work, so the provider stop remains necessary.

## Smallest owner-approved live changes

1. Approve publishing the changed gateway and chat bundle on the existing host, with demo initially OFF. Include the server-side synthetic archive/overlay. No new database, provider, server, watchdog or authentication system is needed.
2. Approve one supervised A40 run, proposed maximum **15 minutes from the provider start request**, including boot/loading. Reuse the reviewed pinned A40 configuration and **`gpu-compatibility/start-pod-proxy.sh`**, which verifies checkpoint-160 artifacts and serves the adapter as `bhoomi-llm-v1-ckpt160`. Expose only SSH and the authenticated gate on HTTP port 8000; vLLM stays on loopback port 8001. The old SSH-only Pod creation payload needs the existing authenticated-gate update, rather than direct exposure of vLLM. The fixed image, base revision, adapter checksums and gate remain as reviewed.
3. Approve setting the four `BHOOMI_DEMO_*` values in `demo.env.example` on the existing host. Reuse the Pod's existing edge-key value; never use the provider account key, never put it in browser code, a URL or a CLI argument. Set the expiry to the supervised stop deadline (absolute UTC, with a `Z` suffix). Keep research inference OFF; do not change approval manifests or Core verification.
4. Owner activates with `BHOOMI_DEMO_ENABLED=1` and restarts the existing gateway. With the existing admin/PIN sessions, run the synthetic question and a follow-up at `https://climreswash.in/bhoomiai`. Confirm the demo notice, model name, actual tool trace and labelled invented result before sharing the session with PIN visitors.

First activation needs no database mutation beyond the gateway's normal admission setting. If a previous attempt or emergency-off created `showcase_demo_control`, it stays latched across restarts and new expiry values. For an explicitly approved subsequent run, **only after confirming the previous Pod is stopped**, the owner may remove that single setting using the existing private database console:

```sql
DELETE FROM bhoomi_beta.settings WHERE key = 'showcase_demo_control';
```

Do not reset this setting during a run: it carries the global count, concurrency lease and emergency-off state. Changing expiry alone never resets limits or unpauses the demo.

## Stop procedure

1. Use **Emergency demo off** while signed in as an administrator on the chat page. It posts to `/bhoomiai/api/demo/off`, latches OFF in existing settings and aborts local in-flight work. Set `BHOOMI_DEMO_ENABLED=0` and restart the existing gateway to leave deployment OFF.
2. In the Runpod console, **Stop the exact demo Pod**, then verify its status is **EXITED**. A model-process exit, container timer, expired demo flag or failed HTTPS request does not establish that provider compute has stopped. Stopped-Pod storage may remain billable; deleting retained storage is a separate owner decision.
3. If console stopping fails, reuse the already-existing local `gpu-compatibility/watchdog_stop.py` with a deadline of now, the exact demo Pod ID file/name and the existing private operator key. It sends `POST /pods/{id}/stop` and checks provider status. Do not create its done flag until EXITED is confirmed. No new watchdog service is introduced.
4. Stop immediately on tool failure, identity mismatch, unexpected data, unlabelled output or any inability to confirm the stop deadline. Application limits do not replace the attended provider stop.

## Local verification

`npm run test:bhoomi-demo` exercises archive integrity, endpoint allowlisting, default OFF, expiry, persistent off, global admission/caps, user-bound conversations, withheld real data, secret/prose suppression, aborted requests and timeout handling. Its SQL storage is an in-memory test adapter; it creates no database service and does not claim live PostgreSQL validation.

The opt-in end-to-end test uses the **real checkpoint-160 adapter**, existing CPU GGUF base and actual `pod_gate.py`, together with real `PinAuth`, `CodeAuth`, `PostgresBetaStore` logic and gateway routing. Its test transport maps the fixed Runpod HTTPS destination to a loopback gate; production code refuses loopback endpoints. It verifies PIN → model tool call → synthetic 2.5 → labelled answer, conversation follow-up, unchanged production approval blocking and PIN revocation.

For local reproduction, start the existing llama.cpp runtime with `--device none -ngl 0`, the registered base GGUF/LoRA/template, model alias `bhoomi-llm-v1-ckpt160`, loopback port 18091, context 6144 and one slot. Then run:

```sh
BHOOMI_DEMO_CPU_E2E=1 npm run test:bhoomi-demo
npm run check:beta
npm run build:beta
```

CPU quantization/runtime differs from the pinned A40 bf16 vLLM runtime. The Runpod HTTPS transport and vLLM tool parser still need the one explicitly approved live smoke test. GPU starts, secret configuration and publication are pending owner approval.
