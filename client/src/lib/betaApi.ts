// Same-origin private beta API. PIN/admin credentials are submitted only by login forms; sessions use HttpOnly cookies.
import type { BhoomiReply } from "./bhoomiAi";

export interface BetaMe {
  demo?: { configured: boolean; enabled: boolean; label: string; limits: { concurrent: number; minute: number; total: number; timeoutMs: number } };
  role: "user" | "admin";
  consent: { required_version: string; accepted_version: string | null; research: boolean; training: boolean };
  quota: { used_today: number; daily_limit: number; remaining_today: number; per_minute: number; per_hour: number };
  model: { label: string; experimental: boolean; baseModel: string; note: string };
  privacy?: { contact: string; processors: string[]; regions: string[]; attributions: string[] };
  feedback_categories: { id: string; label: string }[];
}
export interface BetaReply extends BhoomiReply { unavailable?: string[] }
export class BetaError extends Error {
  constructor(message: string, public status: number, public code?: string, public retryAfter?: number) { super(message); }
}
type Fetch = typeof fetch;

async function call<T>(path: string, init: RequestInit | undefined, f: Fetch): Promise<T> {
  const r = await f(path, { credentials: "same-origin", ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new BetaError(body.message ?? "Request failed", r.status, body.code, body.retry_after_s);
  return body as T;
}
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const getMe = (f: Fetch = fetch) => call<BetaMe>("/bhoomiai/api/me", undefined, f);
export const loginBeta = (pin: string, f: Fetch = fetch) => call<{ ok: true }>("/bhoomiai/api/auth/login", post({ pin }), f);
export const loginBetaAdmin = (email: string, access_code: string, f: Fetch = fetch) => call<{ ok: true }>("/bhoomiai/api/auth/admin/login", post({ email, access_code }), f);
export const acceptConsent = (version: string, training: boolean, f: Fetch = fetch) =>
  call<{ ok: true }>("/bhoomiai/api/consent", post({ version, research: true, training }), f);
export const askBeta = (message: string, sessionId: string | undefined, f: Fetch = fetch) =>
  call<BetaReply>("/bhoomiai/api/chat", post(sessionId ? { message, session_id: sessionId } : { message }), f);
export interface FeedbackBody { interaction_id: string; rating?: "up" | "down"; categories: string[]; comment?: string; suggested_correction?: string }
export const sendBetaFeedback = (b: FeedbackBody, f: Fetch = fetch) => call<{ ok: true; note: string }>("/bhoomiai/api/feedback", post(b), f);

export interface AdminFeedbackItem {
  feedback_id: number; interaction_id: string; user_hash: string; ts: number; rating: string | null; categories: string[];
  comment: string | null; suggested_correction: string | null; review_status: string; reviewer_notes: string | null;
  question: string; answer: string; answer_status: string; verified: boolean; tool_calls: unknown; model: { name?: string } | null;
  unavailable_data: string[]; consent_research: boolean; consent_training: boolean; training_review_candidate: boolean;
}
export const adminFeedback = (qs: Record<string, string>, f: Fetch = fetch) =>
  call<{ items: AdminFeedbackItem[]; review_statuses: string[] }>(`/bhoomiai/api/admin/feedback?${new URLSearchParams(qs)}`, undefined, f);
export const adminReview = (id: number, review_status: string, notes: string, f: Fetch = fetch) =>
  call<{ ok: true }>(`/bhoomiai/api/admin/feedback/${id}/review`, post({ review_status, notes }), f);
export const adminUsage = (f: Fetch = fetch) => call<{ days: { day: string; users: number; requests: number; gpu_seconds: number }[]; killed: boolean; limits?: { perDay: number } }>("/bhoomiai/api/admin/usage", undefined, f);
export const adminKill = (on: boolean, f: Fetch = fetch) => call<{ ok: true; killed: boolean }>("/bhoomiai/api/admin/kill", post({ on }), f);
export const adminInvite = (email: string, role: "user" | "admin", f: Fetch = fetch) => call<{ ok: true; reminder: string }>("/bhoomiai/api/admin/invite", post({ email, role }), f);
export const adminUsers = (f: Fetch = fetch) => call<{ users: { email: string; role: string; status: string; consent_version: string | null; consent_research: number; consent_training: number; daily_quota: number | null }[] }>("/bhoomiai/api/admin/users", undefined, f);
export const exportUrl = (format: "csv" | "jsonl", qs: Record<string, string>) => `/bhoomiai/api/admin/export?${new URLSearchParams({ ...qs, format })}`;

export const adminSuspend = (email: string, suspended: boolean, f: Fetch = fetch) => call<{ ok: true }>("/bhoomiai/api/admin/suspend", post({ email, suspended }), f);
export const adminUser = (email: string, changes: { role?: string; quota?: number }, f: Fetch = fetch) => call<{ ok: true }>("/bhoomiai/api/admin/user", post({ email, ...changes }), f);
export const logoutBeta = (f: Fetch = fetch) => call<{ ok: true; redirect: string }>("/bhoomiai/api/logout", post({}), f);
export const betaHistory = (f: Fetch = fetch) => call<{ items: { interaction_id: string; ts: number; question: string; answer: string; verified: boolean }[] }>("/bhoomiai/api/history", undefined, f);

export const askDemo = (message: string, sessionId: string | undefined, f: Fetch = fetch) =>
  call<BetaReply>("/bhoomiai/api/demo/chat", post(sessionId ? { message, session_id: sessionId } : { message }), f);
export const stopDemo = (f: Fetch = fetch) => call<{ ok: true; enabled: false }>("/bhoomiai/api/demo/off", post({}), f);
