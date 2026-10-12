// Development-only bridge from the ClimResWASH web app to the local Bhoomi AI Core API.
//
//   browser ──▶ /api/bhoomi-ai/*  (this module)  ──▶ http://127.0.0.1:8765  (Bhoomi AI Core, Python)  ──▶ Ollama (127.0.0.1)
//
// Safety properties (all enforced here, all covered by tests/bhoomiAi.test.ts):
//  * DISABLED BY DEFAULT: routes answer 404 unless BHOOMI_AI_ENABLED=1, and never in production;
//  * the upstream must be a loopback address; Ollama is never contacted or exposed from this module;
//  * requests must come from loopback with a localhost Host header (blocks LAN access through the dev server);
//  * strict request validation, size and rate limits; request bodies are never logged;
//  * only a whitelist of response fields is passed to the browser.
import type { Express, Request, Response } from "express";

const SESSION_ID = /^[0-9a-f]{24}$/;
const INTERACTION_ID = /^[0-9a-f]{32}$/;
const LOOPBACK_ADDR = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOST = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_MESSAGE_CHARS = 1500;

/** Selectable development models. "qwen25" is the stable default; "bhoomi_v1" is the experimental fine-tuned adapter
 *  (evaluation only, never approved for deployment) and is only reachable when BHOOMI_AI_EXPERIMENTAL=1. */
export type ModelId = "qwen25" | "bhoomi_v1";
export const MODEL_IDS: readonly ModelId[] = ["qwen25", "bhoomi_v1"];
const isModelId = (v: unknown): v is ModelId => typeof v === "string" && (MODEL_IDS as readonly string[]).includes(v);
export function experimentalEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return bhoomiAiEnabled(env) && env.BHOOMI_AI_EXPERIMENTAL === "1";
}

export interface BhoomiAiOptions {
  env?: Record<string, string | undefined>;
  upstream?: string;
  experimentalUpstream?: string;
  fetchImpl?: typeof fetch;
  ratePerMinute?: number;
  now?: () => number;
}

export function bhoomiAiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && env.BHOOMI_AI_ENABLED === "1";
}

export function loopbackUpstream(raw: string | undefined): URL | null {
  try {
    const u = new URL(raw || "http://127.0.0.1:8765");
    if (u.protocol !== "http:") return null;
    const h = u.hostname === "::1" ? "[::1]" : u.hostname;
    return LOOPBACK_HOST.has(h) ? u : null;
  } catch {
    return null;
  }
}

export function isLocalRequest(remote: string | undefined, hostHeader: string | undefined): boolean {
  if (!remote || !LOOPBACK_ADDR.has(remote)) return false;
  const host = (hostHeader || "").replace(/:\d+$/, "");
  return LOOPBACK_HOST.has(host);
}

export function parseChatBody(body: unknown): { ok: true; value: { message: string; session_id?: string; model?: ModelId } } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "body must be an object" };
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) if (k !== "message" && k !== "session_id" && k !== "model") return { ok: false, error: `unknown field '${k}'` };
  if (b.model !== undefined && !isModelId(b.model)) return { ok: false, error: "unknown model" };
  if (typeof b.message !== "string" || !b.message.trim()) return { ok: false, error: "'message' must be a non-empty string" };
  if (b.message.length > MAX_MESSAGE_CHARS) return { ok: false, error: `'message' is limited to ${MAX_MESSAGE_CHARS} characters` };
  if (b.session_id !== undefined && b.session_id !== null && (typeof b.session_id !== "string" || !SESSION_ID.test(b.session_id)))
    return { ok: false, error: "invalid session_id" };
  return { ok: true, value: { message: b.message, ...(b.session_id ? { session_id: b.session_id as string } : {}),
    ...(b.model ? { model: b.model as ModelId } : {}) } };
}

export function parseFeedbackBody(body: unknown): { ok: true; value: { interaction_id: string; rating: "up" | "down"; comment?: string; model?: ModelId } } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "body must be an object" };
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!["interaction_id", "rating", "comment", "model"].includes(k)) return { ok: false, error: `unknown field '${k}'` };
  if (b.model !== undefined && !isModelId(b.model)) return { ok: false, error: "unknown model" };
  if (typeof b.interaction_id !== "string" || !INTERACTION_ID.test(b.interaction_id)) return { ok: false, error: "invalid interaction_id" };
  if (b.rating !== "up" && b.rating !== "down") return { ok: false, error: "rating must be 'up' or 'down'" };
  if (b.comment !== undefined && (typeof b.comment !== "string" || b.comment.length > 1000)) return { ok: false, error: "invalid comment" };
  return { ok: true, value: { interaction_id: b.interaction_id, rating: b.rating, ...(b.comment ? { comment: b.comment as string } : {}),
    ...(b.model ? { model: b.model as ModelId } : {}) } };
}

const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter(k => k in (o ?? {})).map(k => [k, o[k]]));

export function shapeChatResponse(r: any) {
  return {
    ...pick(r, ["interaction_id", "session_id", "status", "answer", "evidence", "notes", "links", "repaired", "fallback_used",
      "latency_s", "facts", "memory"]),
    verification: pick(r?.verification, ["passed", "violations"]),
    tool_trace: Array.isArray(r?.tool_trace) ? r.tool_trace.map((s: any) => ({
      step: s.step, latency_s: s.latency_s,
      calls: (s.calls ?? []).map((c: any) => pick(c, ["name", "arguments", "status", "errors"])),
    })) : [],
    model: pick(r?.model, ["name", "label", "experimental", "evaluation_only", "deployable", "registry_id", "base_revision"]),
  };
}

export function registerBhoomiAiRoutes(app: Express, opts: BhoomiAiOptions = {}) {
  const env = opts.env ?? process.env;
  const upstream = loopbackUpstream(opts.upstream ?? env.BHOOMI_AI_URL);
  // The experimental upstream is a SEPARATE loopback Core instance; it is never used unless BHOOMI_AI_EXPERIMENTAL=1.
  const expUpstream = loopbackUpstream(opts.experimentalUpstream ?? env.BHOOMI_AI_EXPERIMENTAL_URL ?? "http://127.0.0.1:8766");
  const expOn = experimentalEnabled(env);
  const target = (m: ModelId | undefined): URL | null => (m === "bhoomi_v1" ? (expOn ? expUpstream : null) : upstream);
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const limit = opts.ratePerMinute ?? 30;
  const hits: number[] = [];

  const notFound = (res: Response) => res.status(404).json({ message: "Not found" });
  const gate = (req: Request, res: Response): boolean => {
    if (!bhoomiAiEnabled(env)) { notFound(res); return false; }
    if (!isLocalRequest(req.socket.remoteAddress, req.headers.host)) {
      res.status(403).json({ message: "Bhoomi AI chat is available from localhost only." });
      return false;
    }
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (!LOOPBACK_HOST.has(new URL(origin).hostname === "::1" ? "[::1]" : new URL(origin).hostname)) throw new Error();
      } catch {
        res.status(403).json({ message: "Bhoomi AI chat is available from localhost only." });
        return false;
      }
    }
    if (!upstream) {
      res.status(500).json({ message: "BHOOMI_AI_URL must be a loopback http URL." });
      return false;
    }
    return true;
  };
  const rate = (res: Response): boolean => {
    const t = now();
    while (hits.length && t - hits[0] > 60_000) hits.shift();
    if (hits.length >= limit) { res.status(429).json({ message: "Rate limit exceeded; wait a moment." }); return false; }
    hits.push(t);
    return true;
  };
  const call = async (path: string, init: RequestInit, timeoutMs: number, base: URL | null = upstream) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await doFetch(new URL(path, base!).toString(), { ...init, signal: ctl.signal });
      return { status: r.status, body: await r.json().catch(() => ({})) as any };
    } finally {
      clearTimeout(timer);
    }
  };
  const unavailable = (res: Response) => res.status(503).json({
    message: "The Bhoomi AI service is not running.",
    hint: "Start it with research/bhoomi_ai_core_v0/run.sh (needs Ollama running locally).",
  });

  app.get("/api/bhoomi-ai/status", async (req, res) => {
    if (!gate(req, res)) return;
    const probe = async (base: URL | null) => {
      if (!base) return { ok: false, body: null as any };
      try {
        const r = await call("/api/health", { method: "GET" }, 5_000, base);
        return { ok: r.status === 200, body: r.body };
      } catch {
        return { ok: false, body: null as any };
      }
    };
    const [a, b] = await Promise.all([probe(upstream), expOn ? probe(expUpstream) : Promise.resolve({ ok: false, body: null as any })]);
    const models = [
      { id: "qwen25", label: "Qwen2.5-3B (stable local agent)", experimental: false, enabled: true, upstream_ok: a.ok,
        model: a.body?.model?.model ?? null },
      { id: "bhoomi_v1", label: b.body?.model?.label ?? "Bhoomi-LLM v1 (experimental fine-tune)", experimental: true, enabled: expOn,
        upstream_ok: b.ok, model: b.body?.model?.model ?? null, deployable: false, evaluation_only: true },
    ];
    // top-level fields are kept for older clients: they describe the default (stable) model
    res.json({ enabled: true, upstream_ok: a.ok, model: a.body?.model?.model ?? null, memory: a.body?.memory ?? null, models });
  });

  app.post("/api/bhoomi-ai/chat", async (req, res) => {
    if (!gate(req, res) || !rate(res)) return;
    const p = parseChatBody(req.body);
    if (!p.ok) return res.status(400).json({ message: p.error });
    const base = target(p.value.model);
    if (!base) return res.status(403).json({ message: "The experimental model is not enabled in this development session.",
      hint: "Start with: bash scripts/dev-bhoomi-ai.sh up --experimental" });
    const { model: _model, ...forward } = p.value;       // the Core never sees the selector
    try {
      const r = await call("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(forward),
      }, 240_000, base);
      if (r.status !== 200) return res.status(r.status === 429 ? 429 : 502).json({ message: r.body?.error ?? "Bhoomi AI request failed." });
      res.json(shapeChatResponse(r.body));
    } catch {
      unavailable(res);
    }
  });

  app.post("/api/bhoomi-ai/feedback", async (req, res) => {
    if (!gate(req, res) || !rate(res)) return;
    const p = parseFeedbackBody(req.body);
    if (!p.ok) return res.status(400).json({ message: p.error });
    const base = target(p.value.model);
    if (!base) return res.status(403).json({ message: "The experimental model is not enabled in this development session." });
    const { model: _model, ...forward } = p.value;
    try {
      const r = await call("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(forward),
      }, 15_000, base);
      res.status(r.status === 200 ? 200 : r.status === 404 ? 404 : 502).json(pick(r.body, ["ok", "note", "error"]));
    } catch {
      unavailable(res);
    }
  });
}
