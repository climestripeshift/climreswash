// Client for the dev-only Bhoomi AI bridge (/api/bhoomi-ai/*). Pure functions; fetch is injectable for tests.

export interface BhoomiToolCall { name: string; arguments: Record<string, unknown>; status?: string; errors?: string[] }
export interface BhoomiTraceStep { step: number; latency_s: number; calls: BhoomiToolCall[] }
export interface BhoomiReply {
  interaction_id: string;
  session_id: string;
  status: string;
  answer: string;
  evidence?: string;
  notes?: string[];
  links?: string[];
  repaired?: boolean;
  fallback_used?: boolean;
  latency_s?: number;
  verification?: { passed?: boolean; violations?: { rule: string; detail: string }[] };
  tool_trace?: BhoomiTraceStep[];
  model?: BhoomiReplyModel;
}
/** Selectable development models. "bhoomi_v1" is the experimental fine-tune (evaluation only, never approved for deployment). */
export type ModelId = "qwen25" | "bhoomi_v1";
export interface BhoomiReplyModel {
  name?: string; label?: string; experimental?: boolean; evaluation_only?: boolean; deployable?: boolean;
  registry_id?: string; base_revision?: string;
}
export interface BhoomiModelInfo {
  id: ModelId; label: string; experimental: boolean; enabled: boolean; upstream_ok: boolean; model?: string | null;
  deployable?: boolean; evaluation_only?: boolean;
}
export interface BhoomiStatus { enabled: boolean; upstream_ok: boolean; model?: string | null; models?: BhoomiModelInfo[] }

export class BhoomiAiError extends Error {
  constructor(message: string, public status: number, public hint?: string) { super(message); }
}

type Fetch = typeof fetch;
const BASE = "/api/bhoomi-ai";

async function json(r: Response) {
  return r.json().catch(() => ({}));
}

export async function getStatus(f: Fetch = fetch): Promise<BhoomiStatus | null> {
  const r = await f(`${BASE}/status`);
  if (r.status === 404) return null;               // feature disabled on the server
  if (!r.ok) throw new BhoomiAiError("Bhoomi AI status unavailable", r.status);
  return json(r);
}

export async function sendMessage(message: string, sessionId: string | undefined, f: Fetch = fetch, model?: ModelId): Promise<BhoomiReply> {
  // the selector is only sent for the non-default model, so the default request body is unchanged
  const payload = { message, ...(sessionId ? { session_id: sessionId } : {}), ...(model && model !== "qwen25" ? { model } : {}) };
  const r = await f(`${BASE}/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await json(r);
  if (!r.ok) throw new BhoomiAiError(body.message ?? "Bhoomi AI request failed", r.status, body.hint);
  return body as BhoomiReply;
}

export async function sendFeedback(interactionId: string, rating: "up" | "down", f: Fetch = fetch, model?: ModelId): Promise<void> {
  const r = await f(`${BASE}/feedback`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interaction_id: interactionId, rating, ...(model && model !== "qwen25" ? { model } : {}) }),
  });
  if (!r.ok) throw new BhoomiAiError("Feedback could not be recorded", r.status);
}

/** Only same-app paths returned by the map_link tool are navigable; anything else is dropped. */
export function safeAppLink(link: string): string | null {
  return /^\/(grid|forecast|report\/[^?#\s]+|insights|methodology)(\?[A-Za-z0-9_=&%.+-]*)?$/.test(link) ? link : null;
}

export const STATUS_LABEL: Record<string, string> = {
  verified: "Verified answer", direct: "Direct reply", fallback: "Verified results only",
  clarification: "Needs clarification", unsupported: "Not supported", no_evidence: "No evidence",
  model_error: "Model unavailable", resource_limit: "Low memory", tool_failure: "Tool failure", invalid: "Invalid request",
};

/** Human-readable names for the scientific tools (what was looked up, not how). */
export const TOOL_LABEL: Record<string, string> = {
  district_hazard_profile: "hazard screening profile", rank_districts: "district ranking", forecast_summary: "stored 7-day forecast",
  historical_climate: "long-term ERA5 climate", monsoon_indicators: "monsoon indicators", rainfall_features: "monthly rainfall",
  reported_flood_months: "reported flood months", wash_context: "WASH survey indicators", method_notes: "method notes",
  map_link: "map link", resolve_place: "place lookup", describe_capabilities: "capabilities",
};

export interface AnswerBasis { places: string[]; indicators: string[]; periods: string[]; unavailable: string[]; verified: boolean }

/** What an answer is based on, derived ONLY from the tool calls the Core executed and their statuses (never from the prose). */
export function answerBasis(reply: BhoomiReply): AnswerBasis {
  const places = new Set<string>(), indicators = new Set<string>(), periods = new Set<string>(), unavailable: string[] = [];
  for (const step of reply.tool_trace ?? []) {
    for (const c of step.calls) {
      if (c.name === "ask_clarification" || c.name === "declare_unsupported") continue;
      const a = c.arguments ?? {};
      const place = [a.district, a.state].filter((x): x is string => typeof x === "string" && !!x).join(", ");
      if (place) places.add(place);
      indicators.add(typeof a.metric === "string" ? `${TOOL_LABEL[c.name] ?? c.name}: ${String(a.metric).replace(/_risk$/, "")}` : TOOL_LABEL[c.name] ?? c.name);
      if (typeof a.year === "number") periods.add(String(a.year));
      if (typeof a.year_from === "number" || typeof a.year_to === "number") periods.add(`${a.year_from ?? "…"}–${a.year_to ?? "…"}`);
      if (typeof a.month === "number") periods.add(`month ${a.month}`);
      if (c.status && c.status !== "ok" && c.status !== "stale") {
        unavailable.push(`${TOOL_LABEL[c.name] ?? c.name}${place ? ` for ${place}` : ""}: ${c.status.replace(/_/g, " ")}`);
      }
      if (c.errors?.length) unavailable.push(`${TOOL_LABEL[c.name] ?? c.name}: invalid request`);
    }
  }
  return { places: Array.from(places), indicators: Array.from(indicators), periods: Array.from(periods), unavailable,
    verified: reply.verification?.passed === true };
}
