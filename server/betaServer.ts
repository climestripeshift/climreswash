// Private beta backend; public Replit build/start commands stay unchanged.
// Access-code mode requires isolated PostgreSQL and authenticated proxy ingress.
import express from "express";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { cachedJwks, type JwksFetcher } from "./beta/accessJwt";
import { createBetaRouter, type BetaConfig } from "./beta/gateway";
import { DEFAULT_LIMITS, Limiter, type LimitConfig } from "./beta/limits";
import { PgDatabase } from "./beta/pgDatabase";
import { PostgresBetaStore } from "./beta/pgStore";
import { PostgresLimiter } from "./beta/pgLimits";
import { Conversations } from "./beta/conversations";
import { CodeAuth } from "./beta/codeAuth";
import { ShowcaseDemo } from './beta/demo';
import { PinAuth } from './beta/pinAuth';

async function main() {
const env = process.env;
const num = (k: string, d: number) => {
  const n = env[k] === undefined ? d : Number(env[k]);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Invalid positive integer: ${k}`);
  return n;
};
const hosted = true;
const ingress = env.BETA_INGRESS_MODE ?? "proxy";
if (!["worker", "loopback", "proxy"].includes(ingress)) throw new Error("Invalid BETA_INGRESS_MODE");
if (ingress !== "loopback" && (!env.BETA_ORIGIN_KEY || env.BETA_ORIGIN_KEY.length < 32)) throw new Error("Worker ingress requires BETA_ORIGIN_KEY");
const authMode = env.BETA_AUTH_PROVIDER ?? env.BETA_AUTH_MODE ?? "code";
if (!["cloudflare", "code"].includes(authMode)) throw new Error("Unsupported beta authentication provider");
if (authMode === "code" && (ingress !== "proxy" || !env.BETA_DATABASE_URL)) throw new Error("Access-code login requires proxy ingress and isolated PostgreSQL configuration");

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
let store;
if (env.BETA_DATABASE_URL) {
  const db = new PgDatabase(env.BETA_DATABASE_URL, env.BETA_DB_TRANSPORT === "replit-helium" ? "replit-helium" : "tls");
  await db.assertReady();
  await db.assertIsolatedRole();
  store = new PostgresBetaStore(db, env.BETA_HASH_KEY ?? "");
} else {
  // Legacy/local fixture only: access-code deployment does not import Node 24 SQLite.
  const { BetaStore } = await import("./beta/store");
  store = new BetaStore(env.BETA_DB_PATH ?? "beta.sqlite", env.BETA_HASH_KEY ?? "");
}
if(authMode==='code'&&store instanceof PostgresBetaStore){
  if(!(await store.db.query('SELECT 1 FROM bhoomi_beta.schema_migrations WHERE version=4')).rowCount)
    throw new Error('Apply shared PIN migration before gateway startup');
}
const sessionSeconds=num('BETA_SESSION_SECONDS',28800);
const codeAuth = authMode === "code" ? new CodeAuth(store as PostgresBetaStore, env.BETA_PUBLIC_ORIGIN,
  sessionSeconds,Date.now,new PinAuth(store as PostgresBetaStore,env.BETA_PUBLIC_ORIGIN,sessionSeconds)) : undefined;
const limiter = store instanceof PostgresBetaStore ? new PostgresLimiter(limits, store,Date.now,authMode==='code') : new Limiter(limits, store);
// Bootstrap and user changes use the audited CLI; startup never restores revoked administrators.
const approvalPath = env.BETA_APPROVAL_MANIFEST;
const approval = approvalPath && fs.existsSync(approvalPath) ? JSON.parse(fs.readFileSync(approvalPath, "utf8")) : null;
if (env.BETA_ORIGIN_KEY && env.BETA_ORIGIN_KEY.length < 32) throw new Error("BETA_ORIGIN_KEY must have 32+ characters");
const inferenceReady = env.BETA_CLOUD_APPROVED === "1" && approval?.approved === true
  && approval?.model?.registry_id && approval?.model?.base_revision && /^[0-9a-f]{64}$/.test(approval?.model?.adapter_sha256 ?? "")
  && /^[0-9a-f]{64}$/.test(approval?.data_bundle_sha256 ?? "") && approval?.approved_by && approval?.privacy_contact && approval?.processing_regions?.length && approval?.processors?.length && approval?.attributions?.length;
const config: BetaConfig = {
  hosted, authMode: authMode as "cloudflare" | "code", codeAuth, conversations: store instanceof PostgresBetaStore ? new Conversations(store.db) : undefined, coreKey: env.BETA_ORIGIN_KEY, inferenceReady: !!inferenceReady, expectedModel: approval?.model, originKey: env.BETA_ORIGIN_KEY, access: team && aud ? { teamDomain: team, aud, clockSkewSec: 0 } : undefined, getJwks,
  privacy: approval ? { contact: approval.privacy_contact ?? "", processors: approval.processors ?? [], regions: approval.processing_regions ?? [], attributions: approval.attributions ?? [] } : undefined,
  coreUrls: (env.BETA_CORE_URL ?? "http://127.0.0.1:8765").split(",").map(u => u.trim()).filter(Boolean), publicOrigin: env.BETA_PUBLIC_ORIGIN, limits,
  model: { label: env.BETA_MODEL_LABEL ?? "Bhoomi-LLM v1 checkpoint-160 (experimental research beta)", experimental: true,
           baseModel: "Qwen3-4B-Instruct-2507 + LoRA checkpoint-160",
           note: "Fine-tuned on synthetic, machine-verified examples; not expert-reviewed; not approved for deployment." },
};
if (authMode === "code" && store instanceof PostgresBetaStore) config.demo = new ShowcaseDemo(store);
if(env.BHOOMI_BETA_COLOCATE==="1")config.coreAvailable=()=>new Promise(resolve=>{
  const socket=net.createConnection({host:"127.0.0.1",port:8765});
  const finish=(ready:boolean)=>{socket.destroy();resolve(ready);};
  socket.setTimeout(500);socket.once("connect",()=>finish(true));socket.once("timeout",()=>finish(false));socket.once("error",()=>finish(false));
});

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
app.use(createBetaRouter({ store, limiter, config }));
app.use((_req, res) => { res.status(404).json({ message: "Not found." }); });
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(err.type === "entity.too.large" ? 413 : err instanceof SyntaxError ? 400 : 500).json({ message: "Service error." }); });

const port = num("BETA_PORT", 5100);
const listenHost = env.BETA_LISTEN_HOST ?? "127.0.0.1";
if (!["127.0.0.1", "0.0.0.0"].includes(listenHost) || (listenHost === "0.0.0.0" && (!env.BETA_ORIGIN_KEY || env.BETA_ORIGIN_KEY.length < 32))) throw new Error("Unsafe gateway listener");
app.listen(port, listenHost, () => console.log(`[beta] gateway on 127.0.0.1:${port} (${hosted ? "hosted" : "local"}, auth=${authMode})`));

}
main().catch(() => { console.error("[beta] Startup failed; check private configuration and migration status."); process.exit(1); });
