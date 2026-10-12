# Local beta validation — 12 October 2026

Participant route: `/bhoomiai`; admin: `/bhoomiai/admin`; API namespace: `/bhoomiai/api/*`.

| Check | Result |
| --- | --- |
| Focused TypeScript (`npm run check:beta`) | Passed |
| Gateway/proxy/Worker security and integration tests | 28 passed |
| Bundle/relay/persistent budget tests | 16 passed |
| Full Core scientific, verifier, registry and deadline regression suite | 276 passed |
| Existing-app production client/server build | Passed |
| Chrome browser end-to-end against existing-app build | Passed, including exact selectively staged app snapshot |
| Local Docker smoke with synthetic startup fixture, no real data/weights | Passed: Node 24, non-root/read-only, two experimental Core workers, authenticated gateway, disarmed relay |
| Compose configuration validation | Passed without resolving real environment/secrets or creating resources |
| Cloud bundle without source approval | Refused as intended; no bundle uploaded |
| Public DNS/HTTPS inspection | BigRock NS, A 34.111.179.208, Google Frontend, certificate accepted, SPA fallback at both paths |

Browser coverage includes public home access, protected deep links, signed identity verification, consent with training unchecked, chat, negative thumb, error category, correction, denied user/admin/history access, admin feedback/export, immediate revocation, and logout-token replay denial. API load coverage submits 50 invited identities concurrently, limits active dispatch and checks that each history contains only that user's questions.

All inference responses and identity-provider keys used in tests are local mocks inside `tests/`; the application contains no mock-auth/development-email sign-in mode. Real Cloudflare OTP and callback/cookie behavior are not simulated as if they were verified live. The Worker routing test checks forwarding and secret isolation; the browser uses the same-host loopback proxy option. Neither test establishes actual Cloudflare Access/Worker/Tunnel ordering.

Remaining validation limitations:

- No live DNS, Access, Worker, Tunnel, deployment, GPU resource, artifact transfer, invitation mail or payment was performed.
- No real checkpoint-160 CUDA inference, scientific parity, cold-start timing, GPU memory/load or provider billing/shutdown test was performed. These require separate approval.
- The local Docker smoke initially exposed Core startup requirements for both hex properties and climatology. Synthetic test fixtures resolved this without copying real data. The Node base digest is pinned. The actual approved-data release bundle, named-volume ownership/backup restore, transitive dependency lockfile and cloudflared/worker-vLLM digests remain release checks.
- Whole-repository `npm run check` still reports the pre-existing TS2802 error at `client/src/pages/HexMapV2Page.tsx:2277`. Focused beta checking passes. No unrelated public-page change was made to hide this error.
- The production build reports the existing `import.meta`/CJS warning in `server/routes.ts`. This continuation does not alter that route file.
- Python HTTP test fixtures emit resource-cleanup warnings; tests pass.
- The source's Core `__version__` still declares `0.1.0` despite its v0.2.3 behavior regression suite. Records preserve the declared version; reconcile release metadata before launch rather than labelling it falsely.
- Short-window rate/concurrency/session state assumes a single gateway process. Persistent daily/monthly reservations and pause survive restart; horizontal gateway scaling is not supported by this release.
- Spending controls deny new dispatch, retain conservative reservations and require recent operator/provider billing evidence. They cannot themselves cap a provider account's idle/startup charges. Provider-backed monitoring/shutdown must pass an approved benchmark before unattended operation.

The preceding local scaffold was untracked. The beta commit includes necessary source/tests/configuration from it, but excludes large scientific datasets, adapters/weights, operational databases, secrets and unrelated application changes. Existing experimental registry statuses and production gates are preserved.
