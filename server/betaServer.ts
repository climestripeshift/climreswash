// Standalone entry point for the hosted research beta. NOT part of the production server (server/index.ts is untouched):
// it imports no production routes, no database, no session store. It serves the static beta client and /api/beta/* only,
// bound to loopback; the public hostname is published through Cloudflare Tunnel + Access (see deploy/beta/).
//
//   BETA_ENV=hosted BETA_AUTH_MODE=cloudflare BETA_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com BETA_ACCESS_AUD=<aud tag> \
//   BETA_HASH_KEY=<32+ random chars> BETA_DB_PATH=/data/beta.sqlite BETA_CORE_URL=http://127.0.0.1:8765[,http://127.0.0.1:8766,...] \
//   BETA_PUBLIC_ORIGIN=https://beta.example.org BETA_STATIC_DIR=dist/beta tsx server/betaServer.ts
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { cachedJwks, type JwksFetcher } from "./beta/accessJwt";
import { createBetaRouter, type BetaConfig } from "./beta/gateway";
import { DEFAULT_LIMITS, Limiter, type LimitConfig } from "./beta/limits";
import { BetaStore } from "./beta/store";

const env = process.env;
const num = (k: string, d: number) => {
  const n = env[k] === undefined ? d : Number(env[k]);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Invalid positive integer: ${k}`);
  return n;
};
const hosted = true;
const authMode = "cloudflare" as const;
if (env.BETA_AUTH_MODE && env.BETA_AUTH_MODE !== authMode) throw new Error("Only verified Cloudflare authentication is supported");
if (!env.BETA_PUBLIC_ORIGIN || new URL(env.BETA_PUBLIC_ORIGIN).origin !== env.BETA_PUBLIC_ORIGIN || !env.BETA_PUBLIC_ORIGIN.startsWith("https://")) throw new Error("BETA_PUBLIC_ORIGIN must be an HTTPS origin");
const limits: LimitConfig = {
  ...DEFAULT_LIMITS,
  reservationSeconds: num("BETA_RESERVATION_SECONDS", 300),
  monthlyGpuSecondsBudget: num("BETA_MONTHLY_GPU_SECONDS", 90 * 3600),
  perMinute: num("BETA_LIMIT_PER_MINUTE", DEFAULT_LIMITS.perMinute), perHour: num("BETA_LIMIT_PER_HOUR", DEFAULT_LIMITS.perHour),
  perDay: num("BETA_LIMIT_PER_DAY", DEFAULT_LIMITS.perDay), globalPerDay: num("BETA_LIMIT_GLOBAL_PER_DAY", DEFAULT_LIMITS.globalPerDay),
  globalConcurrent: num("BETA_GLOBAL_CONCURRENT", DEFAULT_LIMITS.globalConcurrent),
  dailyGpuSecondsBudget: num("BETA_DAILY_GPU_SECONDS", DEFAULT_LIMITS.dailyGpuSecondsBudget),
  requestTimeoutMs: num("BETA_REQUEST_TIMEOUT_MS", DEFAULT_LIMITS.requestTimeoutMs),
};
if (limits.requestTimeoutMs > 120_000 || limits.globalConcurrent > 2) throw new Error("Beta timeout/concurrency exceeds validated limits");
const team = env.BETA_ACCESS_TEAM_DOMAIN, aud = env.BETA_ACCESS_AUD;
let getJwks: JwksFetcher | undefined;
if (authMode === "cloudflare") {
  if (!team || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !aud) throw new Error("BETA_ACCESS_TEAM_DOMAIN and BETA_ACCESS_AUD are required");
  getJwks = cachedJwks(async () => {
    const r = await fetch(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!r.ok) throw new Error("jwks fetch failed");
    return (await r.json()) as { keys: never[] };
  });
}
const store = new BetaStore(env.BETA_DB_PATH ?? "beta.sqlite", env.BETA_HASH_KEY ?? "");
// Bootstrap and user changes use the audited CLI; startup never restores revoked administrators.
const approvalPath = env.BETA_APPROVAL_MANIFEST;
const approval = approvalPath && fs.existsSync(approvalPath) ? JSON.parse(fs.readFileSync(approvalPath, "utf8")) : null;
if (env.BETA_ORIGIN_KEY && env.BETA_ORIGIN_KEY.length < 32) throw new Error("BETA_ORIGIN_KEY must have 32+ characters");
const inferenceReady = env.BETA_CLOUD_APPROVED === "1" && approval?.approved === true
  && approval?.model?.registry_id && approval?.model?.base_revision && /^[0-9a-f]{64}$/.test(approval?.model?.adapter_sha256 ?? "")
  && /^[0-9a-f]{64}$/.test(approval?.data_bundle_sha256 ?? "") && approval?.approved_by && approval?.privacy_contact && approval?.processing_regions?.length && approval?.processors?.length && approval?.attributions?.length;
const config: BetaConfig = {
  hosted, authMode, inferenceReady: !!inferenceReady, expectedModel: approval?.model, originKey: env.BETA_ORIGIN_KEY, access: team && aud ? { teamDomain: team, aud } : undefined, getJwks,
  privacy: approval ? { contact: approval.privacy_contact ?? "", processors: approval.processors ?? [], regions: approval.processing_regions ?? [], attributions: approval.attributions ?? [] } : undefined,
  coreUrls: (env.BETA_CORE_URL ?? "http://127.0.0.1:8765").split(",").map(u => u.trim()).filter(Boolean), publicOrigin: env.BETA_PUBLIC_ORIGIN, limits,
  model: { label: env.BETA_MODEL_LABEL ?? "Bhoomi-LLM v1 checkpoint-160 (experimental research beta)", experimental: true,
           baseModel: "Qwen3-4B-Instruct-2507 + LoRA checkpoint-160",
           note: "Fine-tuned on synthetic, machine-verified examples; not expert-reviewed; not approved for deployment." },
};

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()" });
  next();
});
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use(express.json({ limit: "16kb" }));
app.use(createBetaRouter({ store, limiter: new Limiter(limits, store), config }));
app.use((_req, res) => { res.status(404).json({ message: "Not found." }); });
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(err.type === "entity.too.large" ? 413 : err instanceof SyntaxError ? 400 : 500).json({ message: "Service error." }); });

const port = num("BETA_PORT", 5100);
app.listen(port, "127.0.0.1", () => console.log(`[beta] gateway on 127.0.0.1:${port} (${hosted ? "hosted" : "local"}, auth=${authMode})`));
