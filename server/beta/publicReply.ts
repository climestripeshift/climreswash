import { sanitizeEvidence } from "./gateway";

// Never recursively return Core objects. Provenance and errors belong to restricted server storage.
export function publicText(value: unknown): string {
  return sanitizeEvidence(typeof value === "string" ? value.slice(0, 30_000) : "")
    .replace(/\b(?:hf_|rp_|rpa_|sk-)[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::\d+)?\S*/gi, "[internal endpoint]")
    .replace(/(?:\/Users\/|\/home\/|\/app\/|\/etc\/|\/private\/|\/tmp\/)[^\s)]+/g, "[internal path]");
}

export function publicReply(raw: any, label: string, unavailable: string[]) {
  return {
    interaction_id: raw.interaction_id, session_id: raw.session_id,
    status: ["verified", "direct", "no_evidence", "model_error", "resource_limit", "tool_failure", "refused", "unsupported", "unverified", "clarification", "fallback", "error"].includes(raw.status) ? raw.status : "unverified",
    answer: publicText(raw.answer), evidence: publicText(raw.evidence),
    notes: Array.isArray(raw.notes) ? raw.notes.slice(0, 20).map(publicText) : [], links: [],
    verification: { passed: raw.verification?.passed === true, violations: raw.verification?.passed === true ? [] : [{ rule: "review_required", detail: "Answer requires independent review." }] },
    // Scientific execution details remain private. Tool APIs are not exposed.
    tool_trace: [], facts: [], memory: {}, repaired: raw.repaired === true, fallback_used: raw.fallback_used === true,
    latency_s: Number.isFinite(raw.latency_s) ? raw.latency_s : 0,
    model: { name: label, experimental: true, evaluation_only: true, deployable: false }, unavailable: unavailable.slice(0, 20).map(publicText),
  };
}
