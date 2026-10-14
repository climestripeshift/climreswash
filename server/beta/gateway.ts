// Hosted research-beta gateway. The ONLY thing a browser can reach: it authenticates (Cloudflare Access JWT), checks the
// invitation allowlist and consent, enforces quotas / concurrency / timeouts, forwards a minimal fixed request to the loopback
// Bhoomi AI Core, strips internal details from the reply, and records feedback. It exposes no Core endpoint directly, no model
// selector, no tool names to call, no filesystem paths and no debug routes. Production services are not imported or changed.
import { createHash, timingSafeEqual } from "node:crypto";
import { publicReply } from "./publicReply";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { CONSENT_VERSION, FEEDBACK_CATEGORIES, REVIEW_STATUSES, type ReviewStatus } from "../../shared/betaFeedback";
import { shapeChatResponse, loopbackUpstream } from "../bhoomiAi";
import { AccessError, verifyAccessJwt, type AccessConfig, type JwksFetcher } from "./accessJwt";
import { LimitError, Limiter, withTimeout, type LimitConfig } from "./limits";
import type { Role, UserRow } from "./store";
import type { BetaPersistence } from "./persistence";
import type { PostgresLimiter } from "./pgLimits";
import type { CodeAuth } from "./codeAuth";
import { Conversations, ConversationError, coreProof } from "./conversations";
import { asyncRouter } from "./asyncRouter";

export interface BetaConfig {
  hosted: boolean;                       // true on the internet-facing host: dev authentication is impossible
  authMode: "cloudflare" | "code";
  codeAuth?: CodeAuth;
  conversations?: Conversations;
  coreKey?: string;
  coreAvailable?: () => Promise<boolean>;
  demo?: import("./demo").ShowcaseDemo;
  inferenceReady?: boolean;
  originKey?: string;
  privacy?: { contact: string; processors: string[]; regions: string[]; attributions: string[] };
  expectedModel?: { registry_id: string; base_revision: string; adapter_sha256: string };
  access?: AccessConfig;
  getJwks?: JwksFetcher;
  devEmail?: string;                     // dev mode only, loopback only
  coreUrl?: string;                      // loopback Core worker
  coreUrls?: string[];                   // several loopback Core workers (each handles one request at a time); sessions are pinned
  publicOrigin?: string;                 // e.g. https://beta.example.org  (Origin check on writes)
  limits: LimitConfig;
  model: { label: string; experimental: boolean; baseModel: string; note: string };
}
export interface BetaDeps { store: BetaPersistence; limiter: Limiter | PostgresLimiter; config: BetaConfig; fetchImpl?: typeof fetch; now?: () => number }

declare module "express-serve-static-core" {
  interface Request { beta?: { email: string; userHash: string; user: UserRow; tokenHash: string; tokenExpiry: number; issuedAt: number } }
}

const SESSION = /^[0-9a-f]{24}$/;
const INTERACTION = /^[0-9a-f]{32}$/;
const SOURCE_LABEL: Record<string, string> = {
  "india_hex_props.json": "ClimResWASH district / hex dataset (terrain, land use, population, NFHS-5 and JJM aggregates)",
  "hex_historical_climatology.json": "ERA5 climatology aggregated by ClimResWASH",
};

/** Remove internal file paths and hashes from the Core's evidence block; keep source names, definitions and limitations. */
export function sanitizeEvidence(evidence: string | undefined): string {
  if (!evidence) return "";
  return evidence
    .replace(/source:\s*([^\s·]+)\s*·\s*sha256\s*[0-9a-f]+/gi, (_m, p: string) => `source: ${SOURCE_LABEL[p.split("/").pop() ?? ""] ?? "ClimResWASH dataset"}`)
    .replace(/(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.(?:json|csv|md|sqlite|py|ts|tsx|jsonl)/gi, "[internal file]")
    .replace(/\b[0-9a-f]{40,64}\b/gi, "[hash]");
}

export function parseBetaChat(body: unknown, maxChars: number): { ok: true; message: string; sessionId?: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid request" };
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) if (k !== "message" && k !== "session_id") return { ok: false, error: "invalid request" };
  if (typeof b.message !== "string" || !b.message.trim()) return { ok: false, error: "message is required" };
  if (b.message.length > maxChars) return { ok: false, error: `message is limited to ${maxChars} characters` };
  if (b.session_id !== undefined && b.session_id !== null && (typeof b.session_id !== "string" || !SESSION.test(b.session_id))) return { ok: false, error: "invalid session" };
  return { ok: true, message: b.message.trim(), ...(b.session_id ? { sessionId: b.session_id as string } : {}) };
}

export function parseBetaFeedback(body: unknown): { ok: true; v: { interactionId: string; rating?: "up" | "down"; categories: string[]; comment?: string; correction?: string } } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid request" };
  const b = body as Record<string, unknown>;
  const allowed = ["interaction_id", "rating", "categories", "comment", "suggested_correction"];
  for (const k of Object.keys(b)) if (!allowed.includes(k)) return { ok: false, error: "invalid request" };
  if (typeof b.interaction_id !== "string" || !INTERACTION.test(b.interaction_id)) return { ok: false, error: "invalid interaction" };
  if (b.rating !== undefined && b.rating !== "up" && b.rating !== "down") return { ok: false, error: "invalid rating" };
  const cats = b.categories ?? [];
  if (!Array.isArray(cats) || cats.length > 8 || !cats.every(c => typeof c === "string")) return { ok: false, error: "invalid categories" };
  for (const k of ["comment", "suggested_correction"] as const) if (b[k] !== undefined && typeof b[k] !== "string") return { ok: false, error: `invalid ${k}` };
  return { ok: true, v: { interactionId: b.interaction_id, rating: b.rating as "up" | "down" | undefined, categories: cats as string[],
    comment: b.comment as string | undefined, correction: b.suggested_correction as string | undefined } };
}

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                    // spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
};

export function createBetaRouter(deps: BetaDeps): express.Router {
  const { store, limiter, config } = deps;
  if (config.authMode === "code" && (!config.originKey || config.originKey.length < 32)) throw new Error("Code login requires authenticated proxy ingress");
  if(config.authMode === "code" && !config.conversations)throw new Error("Code mode requires durable conversations");
  const doFetch = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cores = (config.coreUrls ?? [config.coreUrl ?? "http://127.0.0.1:8765"]).map(u => loopbackUpstream(u)).filter((u): u is URL => !!u);
  const inflight = cores.map(() => 0);
  const sessionOwner = new Map<string, string>();
  const sessionCore = new Map<string, number>();   // Legacy fixture mode only; access-code mode requires PostgreSQL snapshots.
  const r = asyncRouter();
  const generic = (res: Response, code: number, message: string, extra: object = {}) => res.status(code).json({ message, ...extra });

  // ---- public: liveness only (no versions, no model info, no internals) ------------------------------------------


  // ---- identity + allowlist --------------------------------------------------------------------------------
  const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (config.originKey) {
        const actual = Buffer.from(req.header("x-bhoomi-origin-key") ?? ""), expected = Buffer.from(config.originKey);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return generic(res, 403, "Forbidden.");
      }
      if (config.authMode === "code") {
        if (!config.codeAuth) return generic(res, 503, "Private sign-in is unavailable.");
        req.beta = await config.codeAuth.authenticate(req);
        return next();
      }
      if (config.authMode !== "cloudflare" || !config.access || !config.getJwks) return generic(res, 503, "Private sign-in is unavailable.");
      const cookie = req.header("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith("CF_Authorization="))?.slice("CF_Authorization=".length);
      const token = req.header("cf-access-jwt-assertion") ?? cookie;
      const id = await verifyAccessJwt(token, config.access, config.getJwks, Math.floor(now() / 1000));
      const email = id.email, user = (await store.getUser(email));
      const tokenHash = createHash("sha256").update(token!).digest("hex");
      if ((await store.tokenRevoked(tokenHash))) return generic(res, 401, "Sign-in required.");
      if (!user || user.status === "suspended" || (user.expires_at !== null && user.expires_at <= now()) || id.iat * 1000 <= user.revoked_before)
        return generic(res, 403, "This beta is invitation-only.");
      req.beta = { email, userHash: store.hash(email), user, tokenHash, tokenExpiry: id.exp * 1000, issuedAt: id.iat * 1000 };
      next();
    } catch (e) {
      if (e instanceof AccessError) return generic(res, 401, "Sign-in required.");
      return generic(res, 500, "Service error.");
    }
  };
  const sameOrigin = (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    if (req.method !== "GET" && (!config.publicOrigin || origin !== config.publicOrigin || req.header("sec-fetch-site") === "cross-site")) return generic(res, 403, "Forbidden.");
    if (req.method !== "GET" && !(req.is("application/json"))) return generic(res, 415, "JSON required.");
    next();
  };
  const requireAdmin = (req: Request, res: Response, next: NextFunction) =>
    req.beta?.user.role === "admin" ? next() : generic(res, 403, "Forbidden.");
  const requireConsent = (req: Request, res: Response, next: NextFunction) => {
    const u = req.beta!.user;
    if (!(u.consent_research && u.consent_version === CONSENT_VERSION)) return generic(res, 428, "Please review and accept the research-beta terms first.", { code: "consent_required", consent_version: CONSENT_VERSION });
    next();
  };
  r.use("/bhoomiai/api", async (_req, res, next) => { res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); next(); });
  // Login also requires authenticated ingress. Never expose a standalone origin login endpoint.
  r.use("/bhoomiai/api", (req, res, next) => {
    if (config.originKey) {
      const a = Buffer.from(req.header("x-bhoomi-origin-key") ?? ""), b = Buffer.from(config.originKey);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return generic(res, 403, "Forbidden.");
    }
    next();
  });
  if (config.authMode === "code" && config.codeAuth) config.codeAuth.register(r);
  r.use("/bhoomiai/api", authenticate);
  r.use("/bhoomiai/api", sameOrigin);
  const writes = new Map<string, number[]>();
  r.use("/bhoomiai/api", async (req, res, next) => {
    if (req.method === "GET") return next();
    const key = req.beta!.userHash, recent = (writes.get(key) ?? []).filter(t => now() - t < 60_000);
    if (recent.length >= 30) return generic(res, 429, "Please slow down.");
    recent.push(now()); writes.set(key, recent); next();
  });
  r.get("/bhoomiai/api/health", async (_req, res) => res.json({ ok: true }));
  r.get("/bhoomiai/api/history", requireConsent, async (req, res) => res.json({ items: (await store.history(req.beta!.userHash)) }));
  r.post("/bhoomiai/api/logout", async (req, res) => {
    if (config.authMode === "code" && config.codeAuth) return config.codeAuth.logout(req, res);
    (await store.revokeToken(req.beta!.tokenHash, req.beta!.tokenExpiry));
    res.json({ ok: true, redirect: "/cdn-cgi/access/logout" });
  });

  // Showcase routes inherit ingress, PIN/admin authentication, CSRF and write throttles above.
  // They never enter research consent, approval, Core verification, quota or conversation paths.
  if (config.demo && config.authMode === "code" && config.codeAuth)
    config.demo.register(r, req => config.codeAuth!.authenticate(req));

  // ---- me / consent ------------------------------------------------------------------------------------------
  r.get("/bhoomiai/api/me", async (req, res) => {
    const u = req.beta!.user;
    res.json({
      demo: config.demo ? await config.demo.status() : undefined,
      role: u.role, consent: { required_version: CONSENT_VERSION, accepted_version: u.consent_version, research: u.consent_research, training: u.consent_training },
      quota: (await limiter.snapshot(req.beta!.userHash, u.daily_quota ?? config.limits.perDay)), model: config.model, feedback_categories: FEEDBACK_CATEGORIES, privacy: config.privacy,
    });
  });
  r.post("/bhoomiai/api/consent", async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (b.version !== CONSENT_VERSION || b.research !== true || (b.training !== true && b.training !== false) || Object.keys(b).length !== 3)
      return generic(res, 400, "Invalid consent submission.");
    (await store.recordConsent(req.beta!.email, CONSENT_VERSION, true, b.training === true));
    res.json({ ok: true });
  });

  // ---- chat --------------------------------------------------------------------------------------------------
  r.post("/bhoomiai/api/chat", requireConsent, async (req, res) => {
    if (!config.inferenceReady) return generic(res, 503, "Inference is awaiting launch approval.");
    if (config.coreAvailable && !await config.coreAvailable()) return generic(res,503,"The assistant is starting; please try again shortly.");
    const p = parseBetaChat(req.body, config.limits.maxQuestionChars);
    if (!p.ok) return generic(res, 400, p.error);
    if (cores.length === 0) return generic(res, 500, "Service misconfigured.");
    const user = req.beta!.userHash;
    if (!config.conversations && p.sessionId && sessionOwner.get(p.sessionId) !== user) return generic(res, 400, "invalid session");
    const idx = !config.conversations && p.sessionId && sessionCore.has(p.sessionId) ? sessionCore.get(p.sessionId)! : inflight.indexOf(Math.min(...inflight));
    const core = cores[idx];
    if (inflight[idx]) { res.set("Retry-After", "10"); return generic(res, 429, "This conversation is busy; try again shortly."); }
    // Reserve the local Core worker before PostgreSQL I/O yields to another request.
    inflight[idx]++;
    let slot;
    let ticket: Awaited<ReturnType<Conversations["begin"]>> | undefined;
    try {
      if (config.conversations) ticket = await config.conversations.begin(user,p.sessionId,config.limits.requestTimeoutMs);
      slot = (await limiter.acquire(user, req.beta!.user.daily_quota ?? config.limits.perDay)); }
    catch (e) {
      inflight[idx]--;
      if(ticket)await config.conversations!.cancel(ticket);
      if(e instanceof ConversationError)return generic(res,e.code === "busy" ? 429 : 400,e.code === "busy" ? "This conversation is busy." : "Invalid conversation.");
      if (e instanceof LimitError) return res.status(e.code === "kill_switch" || e.code === "gpu_budget" ? 503 : 429).set("Retry-After", String(e.retryAfterSec)).json({ message: e.message, code: e.code, retry_after_s: e.retryAfterSec });
      return generic(res, 500, "Service error.");
    }
    const t0 = now();
    try {
      const out = await withTimeout(config.limits.requestTimeoutMs, async signal => {
        const payload: Record<string,unknown> = { message:p.message,...(ticket ? { session_id:ticket.id,portable_session:ticket.state } : p.sessionId ? {session_id:p.sessionId} : {}),deployment:"cloud_beta",user_hash:user,deadline_ms:t0+config.limits.requestTimeoutMs };
        if(ticket)payload.gateway_proof=coreProof(payload,config.coreKey??config.originKey!);
        const rr = await doFetch(new URL("/api/chat", core).toString(), {
          method: "POST", headers: { "Content-Type": "application/json" }, signal,
          body: JSON.stringify(payload),
        });
        return { status: rr.status, body: (await rr.json().catch(() => ({}))) as any };
      });
      if (out.status !== 200) {
        if (out.status !== 429) await limiter.setKilled(true);
        return generic(res, out.status === 429 ? 429 : 502, out.status === 429 ? "The model is busy; try again shortly." : "The assistant could not answer this request.");
      }
      const identity = config.expectedModel;
      if (!INTERACTION.test(out.body.interaction_id ?? "") || !SESSION.test(out.body.session_id ?? "")) throw new Error("invalid Core identifiers");
      if (identity && (out.body.model?.experimental !== true || out.body.model?.deployable !== false || Object.entries(identity).some(([k, v]) => out.body.model?.[k] !== v))) throw new Error("model identity mismatch");
      const current = (await store.getUser(req.beta!.email));
      if (!current || current.status === "suspended" || current.revoked_before >= req.beta!.issuedAt || (current.expires_at !== null && current.expires_at <= now()) || (await store.tokenRevoked(req.beta!.tokenHash))) return generic(res, 403, "Access revoked.");
      if(config.authMode==='code'&&config.codeAuth){
        try{await config.codeAuth.authenticate(req);}catch(e){if(e instanceof AccessError)return generic(res,403,'Access revoked.');throw e;}
      }
      const shaped: any = shapeChatResponse(out.body);
      if (!config.conversations && typeof shaped.session_id === "string") {
        if (sessionOwner.size > 5000) { sessionOwner.clear(); sessionCore.clear(); }
        sessionOwner.set(shaped.session_id, user);
        sessionCore.set(shaped.session_id, idx);
      }
      const unavailable: string[] = (shaped.tool_trace ?? []).flatMap((s: any) => (s.calls ?? [])
        .filter((c: any) => c.status && c.status !== "ok" && c.status !== "stale" && c.status !== "control")
        .map((c: any) => `${c.name}: ${String(c.status).replace(/_/g, " ")}`));
      const reply = publicReply(shaped, config.model.label, unavailable);
      const save = async () => { await store.logInteraction({ id: String(shaped.interaction_id), userHash: user, question: p.message, answer: reply.answer, status: String(shaped.status),
        verified: shaped.verification?.passed === true, verification: out.body.verification, toolCalls: out.body.provenance ?? out.body.tool_trace, model: out.body.model,
        latencyS: Number(shaped.latency_s ?? 0), unavailable, sessionId: String(shaped.session_id ?? "") }); };
      if(ticket) {
        if(out.body.session_id!==ticket.id || !out.body.portable_session)throw new Error("Missing portable conversation");
        await config.conversations!.finish(ticket,out.body.portable_session,save);
      } else await save();
      res.json(reply);
    } catch (e) {
      await limiter.setKilled(true); // uncertain upstream work or identity: stop all further dispatch until operator review
      if ((e as Error).name === "AbortError") return generic(res, 504, "The assistant took too long; please try again.");
      return generic(res, 503, "The assistant is temporarily unavailable.");
    } finally {
      inflight[idx]--;
      if(ticket)await config.conversations!.cancel(ticket);
      (await slot.release((now() - t0) / 1000));
    }
  });

  // ---- feedback ----------------------------------------------------------------------------------------------
  r.post("/bhoomiai/api/feedback", requireConsent, async (req, res) => {
    const p = parseBetaFeedback(req.body);
    if (!p.ok) return generic(res, 400, p.error);
    try {
      const id = (await store.addFeedback({ interactionId: p.v.interactionId, userHash: req.beta!.userHash, rating: p.v.rating, categories: p.v.categories, comment: p.v.comment, correction: p.v.correction }));
      res.json({ ok: true, feedback_id: id, note: "Thank you. Feedback is reviewed by the research team and is not used to train models without review and your separate consent." });
    } catch (e) {
      generic(res, 400, "Feedback could not be recorded.");
    }
  });

  // ---- admin -------------------------------------------------------------------------------------------------
  const filters = (q: Request["query"]) => ({
    status: typeof q.status === "string" ? q.status : undefined, category: typeof q.category === "string" ? q.category : undefined,
    rating: typeof q.rating === "string" ? q.rating : undefined, model: typeof q.model === "string" ? q.model : undefined,
    verified: q.verified === "true" ? true : q.verified === "false" ? false : undefined,
    from: q.from ? Number(q.from) : undefined, to: q.to ? Number(q.to) : undefined, limit: q.limit ? Number(q.limit) : undefined, offset: q.offset ? Number(q.offset) : undefined,
  });
  r.use("/bhoomiai/api/admin", async (req, res, next) => {
    for (const k of ["from", "to", "limit", "offset"]) if (req.query[k] !== undefined && (!Number.isSafeInteger(Number(req.query[k])) || Number(req.query[k]) < 0)) return generic(res, 400, "Invalid filter.");
    next();
  });
  r.get("/bhoomiai/api/admin/feedback", requireAdmin, async (req, res) => res.json({ items: (await store.listFeedback(filters(req.query))), review_statuses: REVIEW_STATUSES }));
  r.post("/bhoomiai/api/admin/feedback/:id/review", requireAdmin, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    try { (await store.review(Number(req.params.id), String(b.review_status) as ReviewStatus, req.beta!.email, typeof b.notes === "string" ? b.notes : "")); res.json({ ok: true }); }
    catch { generic(res, 400, "Review could not be saved."); }
  });
  r.get("/bhoomiai/api/admin/export", requireAdmin, async (req, res) => {
    const rows = (await store.exportRows(filters(req.query)));
    (await store.audit(req.beta!.userHash, "export", String(rows.length)));
    if (req.query.format === "csv") {
      const cols = ["feedback_id", "interaction_id", "user_hash", "ts", "rating", "categories", "comment", "suggested_correction", "review_status", "question",
        "answer", "answer_status", "verified", "verification", "model", "tool_calls", "consent_at_interaction", "unavailable_data", "consent_training", "training_review_candidate", "training_use_authorized"];
      const csv = [cols.join(","), ...rows.map(row => cols.map(c => csvCell((row as any)[c])).join(","))].join("\n");
      res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bhoomi_beta_feedback.csv"' }).send(csv);
    } else {
      res.set({ "Content-Type": "application/x-ndjson", "Content-Disposition": 'attachment; filename="bhoomi_beta_feedback.jsonl"' })
        .send(rows.map(x => JSON.stringify(x)).join("\n"));
    }
  });
  r.get("/bhoomiai/api/admin/users", requireAdmin, async (_req, res) => res.json({ users: (await store.listUsers()) }));
  r.post("/bhoomiai/api/admin/invite", requireAdmin, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    try {
      (await store.invite(String(b.email ?? ""), b.role === "admin" ? ("admin" as Role) : "user", req.beta!.email));
      res.json({ ok: true, reminder: "For access-code login, run the operator CLI to issue a private code and share it separately. Email alone cannot sign in." });
    } catch { generic(res, 400, "Invitation could not be created."); }
  });
  r.post("/bhoomiai/api/admin/suspend", requireAdmin, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    try { (await store.manageUser(String(b.email ?? ""), { status: b.suspended === false ? "active" : "suspended" }, req.beta!.email)); res.json({ ok: true }); }
    catch { generic(res, 400, "Access change could not be saved."); }
  });
  r.post("/bhoomiai/api/admin/user", requireAdmin, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (Object.keys(b).some(k => !["email", "role", "quota", "expires_at"].includes(k))) return generic(res, 400, "Invalid change.");
    try {
      (await store.manageUser(String(b.email ?? ""), { ...(b.role !== undefined ? { role: b.role as Role } : {}), ...(b.quota !== undefined ? { quota: b.quota as number } : {}), ...(b.expires_at !== undefined ? { expiresAt: b.expires_at as number } : {}) }, req.beta!.email));
      res.json({ ok: true });
    } catch { generic(res, 400, "Access change could not be saved."); }
  });
  r.get("/bhoomiai/api/admin/usage", requireAdmin, async (_req, res) => res.json({ days: (await store.usageSummary(30)), limits: config.limits, killed: (await limiter.isKilled()) }));
  r.post("/bhoomiai/api/admin/kill", requireAdmin, async (req, res) => {
    if (typeof req.body?.on !== "boolean") return generic(res, 400, "Invalid pause setting.");
    await limiter.setKilled(req.body.on);
    (await store.audit(req.beta!.userHash, "kill_switch", String((await limiter.isKilled()))));
    res.json({ ok: true, killed: (await limiter.isKilled()) });
  });

  // anything else under /bhoomiai/api is a 404 with no detail
  r.use("/bhoomiai/api", async (_req, res) => generic(res, 404, "Not found."));
  return r;
}

export function registerBetaRoutes(app: Express, deps: BetaDeps) {
  app.use(express.json({ limit: "16kb" }));
  app.use(createBetaRouter(deps));
}
