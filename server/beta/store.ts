// Persistent store for the hosted research beta (Node's built-in SQLite; no extra dependency).
// System of record for: invited users (allowlist + role), consent, interactions as shown to users, feedback, review
// status, usage counters and an audit trail. Users are referenced by a keyed hash (pseudonymous); e-mail addresses live only
// in `users` and never in exports.
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { FEEDBACK_CATEGORY_IDS, MAX_COMMENT_CHARS, MAX_CORRECTION_CHARS, REVIEW_STATUSES, type ReviewStatus } from "../../shared/betaFeedback";
import type { UsageStore } from "./limits";

export type Role = "user" | "admin";
export interface UserRow { email: string; role: Role; status: "invited" | "active" | "suspended"; consent_version: string | null;
  consent_research: boolean; consent_training: boolean; daily_quota: number | null; revoked_before: number; expires_at: number | null }
export interface InteractionIn {
  id: string; userHash: string; question: string; answer: string; status: string; verified: boolean; verification: unknown;
  toolCalls: unknown; model: unknown; latencyS: number; unavailable: string[]; sessionId: string;
}
export interface FeedbackIn { interactionId: string; userHash: string; rating?: "up" | "down"; categories: string[]; comment?: string; correction?: string }
export interface FeedbackFilter { status?: string; category?: string; rating?: string; verified?: boolean; model?: string; from?: number; to?: number; limit?: number; offset?: number }

const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,255}$/;

export class BetaStore implements UsageStore {
  private db: DatabaseSync;
  constructor(path: string, private hashKey: string, private now: () => number = Date.now) {
    if (hashKey.length < 32) throw new Error("BETA_HASH_KEY must be at least 32 characters");
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, user_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'invited', invited_at REAL NOT NULL, invited_by TEXT, consent_version TEXT, consent_at REAL,
        consent_research INTEGER NOT NULL DEFAULT 0, consent_training INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS interactions (id TEXT PRIMARY KEY, user_hash TEXT NOT NULL, ts REAL NOT NULL, session_id TEXT,
        question TEXT NOT NULL, answer TEXT NOT NULL, status TEXT, verified INTEGER NOT NULL DEFAULT 0, verification_json TEXT,
        tool_calls_json TEXT, model_json TEXT, latency_s REAL, unavailable_json TEXT);
      CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, interaction_id TEXT NOT NULL, user_hash TEXT NOT NULL,
        ts REAL NOT NULL, rating TEXT, categories_json TEXT NOT NULL, comment TEXT, correction TEXT,
        review_status TEXT NOT NULL DEFAULT 'new', reviewer TEXT, reviewed_at REAL, reviewer_notes TEXT);
      CREATE TABLE IF NOT EXISTS usage (user_hash TEXT NOT NULL, day TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
        gpu_seconds REAL NOT NULL DEFAULT 0, PRIMARY KEY (user_hash, day));
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, actor_hash TEXT, action TEXT NOT NULL, detail TEXT);
      CREATE INDEX IF NOT EXISTS fb_status ON feedback(review_status);
      CREATE INDEX IF NOT EXISTS ix_user ON interactions(user_hash);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revoked_tokens (hash TEXT PRIMARY KEY, expires_at REAL NOT NULL);
    `);
    // Additive migrations preserve existing pilot databases.
    const migrate = (table: string, column: string, definition: string) => {
      if (!this.db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    };
    migrate("users", "daily_quota", "INTEGER");
    migrate("users", "revoked_before", "REAL NOT NULL DEFAULT 0");
    migrate("users", "expires_at", "REAL");
    migrate("interactions", "consent_json", "TEXT");
  }

  hash(email: string): string {
    return createHmac("sha256", this.hashKey).update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
  }

  // ---- users / consent -------------------------------------------------------------------------------------
  invite(email: string, role: Role, by: string) {
    const e = email.trim().toLowerCase();
    if (!EMAIL.test(e)) throw new Error("invalid e-mail address");
    if (this.getUser(e)) { this.manageUser(e, { role }, by); return this.hash(e); }
    this.db.prepare(`INSERT INTO users (email, user_hash, role, status, invited_at, invited_by) VALUES (?,?,?, 'invited', ?, ?)
      ON CONFLICT(email) DO UPDATE SET role = excluded.role`).run(e, this.hash(e), role, this.now(), by);
    this.audit(this.hash(by), "invite", `${role}`);
    return this.hash(e);
  }
  getUser(email: string): UserRow | null {
    const r = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
    return r ? this.rowToUser(r) : null;
  }
  private rowToUser(r: Record<string, unknown>): UserRow {
    return { email: String(r.email), role: r.role as Role, status: r.status as UserRow["status"],
      daily_quota: r.daily_quota == null ? null : Number(r.daily_quota), revoked_before: Number(r.revoked_before), expires_at: r.expires_at == null ? null : Number(r.expires_at),
      consent_version: (r.consent_version as string) ?? null, consent_research: r.consent_research === 1, consent_training: r.consent_training === 1 };
  }
  listUsers() {
    return this.db.prepare("SELECT email, role, status, invited_at, consent_version, consent_research, consent_training, daily_quota, expires_at FROM users ORDER BY invited_at").all();
  }
  setStatus(email: string, status: UserRow["status"], by: string) {
    this.db.prepare("UPDATE users SET status = ? WHERE email = ?").run(status, email.trim().toLowerCase());
    if (status === "suspended") this.db.prepare("UPDATE users SET revoked_before = ? WHERE email = ?").run(this.now(), email.trim().toLowerCase());
    this.audit(this.hash(by), `user_${status}`, this.hash(email));
  }
  recordConsent(email: string, version: string, research: boolean, training: boolean) {
    const e = email.trim().toLowerCase();
    this.db.prepare(`UPDATE users SET consent_version = ?, consent_at = ?, consent_research = ?, consent_training = ?,
      status = CASE WHEN status = 'invited' THEN 'active' ELSE status END WHERE email = ?`).run(version, this.now(), research ? 1 : 0, training ? 1 : 0, e);
    this.audit(this.hash(e), "consent", JSON.stringify({ version, research, training }));
  }

  // ---- interactions / feedback -----------------------------------------------------------------------------
  logInteraction(i: InteractionIn) {
    const consent = this.db.prepare("SELECT consent_version, consent_at, consent_research, consent_training FROM users WHERE user_hash = ?").get(i.userHash);
    this.db.prepare(`INSERT INTO interactions (id, user_hash, ts, session_id, question, answer, status, verified, verification_json,
      tool_calls_json, model_json, latency_s, unavailable_json, consent_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      i.id, i.userHash, this.now(), i.sessionId, i.question, i.answer, i.status, i.verified ? 1 : 0, JSON.stringify(i.verification),
      JSON.stringify(i.toolCalls), JSON.stringify(i.model), i.latencyS, JSON.stringify(i.unavailable), JSON.stringify(consent ?? {}));
  }
  interactionOwner(id: string): string | null {
    const r = this.db.prepare("SELECT user_hash FROM interactions WHERE id = ?").get(id);
    return r ? String(r.user_hash) : null;
  }
  addFeedback(f: FeedbackIn): number {
    if (this.interactionOwner(f.interactionId) !== f.userHash) throw new Error("unknown interaction");
    if (f.rating && f.rating !== "up" && f.rating !== "down") throw new Error("invalid rating");
    const cats = Array.from(new Set(f.categories));
    if (!cats.every(c => FEEDBACK_CATEGORY_IDS.includes(c))) throw new Error("unknown feedback category");
    if (!f.rating && cats.length === 0 && !f.comment && !f.correction) throw new Error("empty feedback");
    const comment = (f.comment ?? "").slice(0, MAX_COMMENT_CHARS) || null;
    const correction = (f.correction ?? "").slice(0, MAX_CORRECTION_CHARS) || null;
    // One row per (interaction, user): a thumbs click followed by the detailed form is merged, so reviewers see one record and
    // a user cannot flood the queue. New content re-opens a reviewed record.
    const prev = this.db.prepare("SELECT id, rating, categories_json, comment, correction FROM feedback WHERE interaction_id = ? AND user_hash = ?")
      .get(f.interactionId, f.userHash);
    if (prev) {
      const rating = f.rating ?? (prev.rating as string | null);
      const merged = cats.length ? cats : (JSON.parse(String(prev.categories_json)) as string[]);
      const c2 = comment ?? (prev.comment as string | null), k2 = correction ?? (prev.correction as string | null);
      const changed = rating !== prev.rating || JSON.stringify(merged) !== String(prev.categories_json) || c2 !== prev.comment || k2 !== prev.correction;
      this.db.prepare(`UPDATE feedback SET ts = ?, rating = ?, categories_json = ?, comment = ?, correction = ?${changed ? ", review_status = 'new'" : ""} WHERE id = ?`)
        .run(this.now(), rating, JSON.stringify(merged), c2, k2, Number(prev.id));
      return Number(prev.id);
    }
    const r = this.db.prepare(`INSERT INTO feedback (interaction_id, user_hash, ts, rating, categories_json, comment, correction)
      VALUES (?,?,?,?,?,?,?)`).run(f.interactionId, f.userHash, this.now(), f.rating ?? null, JSON.stringify(cats), comment, correction);
    return Number(r.lastInsertRowid);
  }
  listFeedback(flt: FeedbackFilter = {}, admin = true) {
    const w: string[] = [], a: unknown[] = [];
    if (flt.status) { w.push("f.review_status = ?"); a.push(flt.status); }
    if (flt.rating) { w.push("f.rating = ?"); a.push(flt.rating); }
    if (flt.category) { w.push("f.categories_json LIKE ?"); a.push(`%"${flt.category.replace(/[^a-z_]/g, "")}"%`); }
    if (flt.verified !== undefined) { w.push("i.verified = ?"); a.push(flt.verified ? 1 : 0); }
    if (flt.model) { w.push("i.model_json LIKE ?"); a.push(`%${flt.model.replace(/[%_"\\]/g, "")}%`); }
    if (flt.from !== undefined) { w.push("f.ts >= ?"); a.push(flt.from); }
    if (flt.to !== undefined) { w.push("f.ts <= ?"); a.push(flt.to); }
    const sql = `SELECT f.id, f.interaction_id, f.user_hash, f.ts, f.rating, f.categories_json, f.comment, f.correction, f.review_status,
        f.reviewer, f.reviewed_at, f.reviewer_notes, i.question, i.answer, i.status, i.verified, i.verification_json, i.tool_calls_json,
        i.model_json, i.latency_s, i.unavailable_json, i.consent_json, u.consent_research, u.consent_training
      FROM feedback f JOIN interactions i ON i.id = f.interaction_id LEFT JOIN users u ON u.user_hash = f.user_hash
      ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY f.ts DESC, f.id DESC LIMIT ? OFFSET ?`;
    return this.db.prepare(sql).all(...a, Math.min(Math.max(flt.limit ?? 200, 1), 1000), Math.max(flt.offset ?? 0, 0)).map(r => this.shapeFeedback(r, admin));
  }
  private shapeFeedback(r: Record<string, unknown>, _admin: boolean) {
    const j = (s: unknown) => { try { return JSON.parse(String(s)); } catch { return null; } };
    const unavailable = j(r.unavailable_json) ?? [];
    const consentTraining = r.consent_training === 1;
    return {
      feedback_id: Number(r.id), interaction_id: String(r.interaction_id), user_hash: String(r.user_hash), ts: Number(r.ts),
      rating: r.rating, categories: j(r.categories_json) ?? [], comment: r.comment, suggested_correction: r.correction,
      review_status: String(r.review_status), reviewer: r.reviewer, reviewed_at: r.reviewed_at, reviewer_notes: r.reviewer_notes,
      consent_at_interaction: j(r.consent_json),
      question: String(r.question), answer: String(r.answer), answer_status: r.status, verified: r.verified === 1,
      verification: j(r.verification_json), tool_calls: j(r.tool_calls_json), model: j(r.model_json), latency_s: r.latency_s,
      unavailable_data: unavailable, consent_research: r.consent_research === 1, consent_training: consentTraining,
      // only a QUEUE flag: training use still needs the manual provenance/licence/consent review and explicit authorisation
      training_review_candidate: String(r.review_status) === "candidate_for_training_review" && consentTraining && unavailable.length === 0,
      training_use_authorized: false,
    };
  }
  review(feedbackId: number, status: ReviewStatus, reviewerEmail: string, notes: string) {
    if (!(REVIEW_STATUSES as readonly string[]).includes(status)) throw new Error("invalid review status");
    const r = this.db.prepare(`UPDATE feedback SET review_status = ?, reviewer = ?, reviewed_at = ?, reviewer_notes = ? WHERE id = ?`)
      .run(status, this.hash(reviewerEmail), this.now(), notes.slice(0, 1000), feedbackId);
    if (Number(r.changes) === 0) throw new Error("unknown feedback id");
    this.audit(this.hash(reviewerEmail), "review", `${feedbackId}:${status}`);
  }
  /** Export rows for researchers: only users who consented to research use; pseudonymous; no e-mail addresses. */
  exportRows(flt: FeedbackFilter = {}) {
    const rows: ReturnType<BetaStore["listFeedback"]> = [];
    for (let offset = 0; ; offset += 1000) {
      const batch = this.listFeedback({ ...flt, limit: 1000, offset });
      rows.push(...batch.filter(r => r.consent_research));
      if (batch.length < 1000) break;
    }
    return rows;
  }

  // ---- usage (UsageStore) ----------------------------------------------------------------------------------
  dayTotals(day: string) {
    const r = this.db.prepare("SELECT COALESCE(SUM(requests),0) AS q, COALESCE(SUM(gpu_seconds),0) AS g FROM usage WHERE day = ?").get(day)!;
    return { requests: Number(r.q), gpuSeconds: Number(r.g) };
  }
  userDay(userHash: string, day: string) {
    const r = this.db.prepare("SELECT requests, gpu_seconds FROM usage WHERE user_hash = ? AND day = ?").get(userHash, day);
    return { requests: r ? Number(r.requests) : 0, gpuSeconds: r ? Number(r.gpu_seconds) : 0 };
  }
  add(userHash: string, day: string, requests: number, gpuSeconds: number) {
    this.db.prepare(`INSERT INTO usage (user_hash, day, requests, gpu_seconds) VALUES (?,?,?,?)
      ON CONFLICT(user_hash, day) DO UPDATE SET requests = requests + excluded.requests, gpu_seconds = gpu_seconds + excluded.gpu_seconds`)
      .run(userHash, day, requests, gpuSeconds);
  }
  usageSummary(days = 30) {
    return this.db.prepare(`SELECT day, COUNT(DISTINCT user_hash) AS users, SUM(requests) AS requests, ROUND(SUM(gpu_seconds),1) AS gpu_seconds
      FROM usage GROUP BY day ORDER BY day DESC LIMIT ?`).all(days);
  }

  audit(actorHash: string | null, action: string, detail = "") {
    this.db.prepare("INSERT INTO audit (ts, actor_hash, action, detail) VALUES (?,?,?,?)").run(this.now(), actorHash, action, detail.slice(0, 500));
  }
  monthTotal(month: string) { return Number(this.db.prepare("SELECT COALESCE(SUM(gpu_seconds), 0) AS n FROM usage WHERE day LIKE ?").get(month + "%")!.n); }
  setting(key: string, fallback = ""): string { return String(this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? fallback); }
  setSetting(key: string, value: string) { this.db.prepare("INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value); }
  revokeToken(hash: string, expiresAt: number) { this.db.prepare("INSERT OR REPLACE INTO revoked_tokens VALUES (?,?)").run(hash, expiresAt); }
  tokenRevoked(hash: string) { this.db.prepare("DELETE FROM revoked_tokens WHERE expires_at < ?").run(this.now()); return !!this.db.prepare("SELECT hash FROM revoked_tokens WHERE hash = ?").get(hash); }
  manageUser(email: string, changes: { role?: Role; quota?: number; status?: "active" | "suspended"; expiresAt?: number }, by: string) {
    const e = email.trim().toLowerCase(), user = this.getUser(e);
    if (!user) throw new Error("unknown user");
    if (changes.role !== undefined && !["admin", "user"].includes(changes.role)) throw new Error("invalid role");
    if (changes.quota !== undefined && (!Number.isSafeInteger(changes.quota) || changes.quota < 0 || changes.quota > 120)) throw new Error("invalid quota");
    if (changes.expiresAt !== undefined && (!Number.isSafeInteger(changes.expiresAt) || changes.expiresAt <= this.now())) throw new Error("invalid expiry");
    if (user.role === "admin" && (changes.role === "user" || changes.status === "suspended") && Number(this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status != 'suspended'").get()!.n) <= 1) throw new Error("last admin");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (changes.role) this.db.prepare("UPDATE users SET role = ? WHERE email = ?").run(changes.role, e);
      if (changes.quota !== undefined) this.db.prepare("UPDATE users SET daily_quota = ? WHERE email = ?").run(changes.quota, e);
      if (changes.expiresAt !== undefined) this.db.prepare("UPDATE users SET expires_at = ? WHERE email = ?").run(changes.expiresAt, e);
      if (changes.status) this.setStatus(e, changes.status, by);
      this.audit(this.hash(by), "manage_user", JSON.stringify({ user: this.hash(e), ...changes }));
      this.db.exec("COMMIT");
    } catch (err) { this.db.exec("ROLLBACK"); throw err; }
  }
  history(userHash: string) {
    return this.db.prepare("SELECT id, ts, question, answer, status, verified, model_json FROM interactions WHERE user_hash = ? ORDER BY ts DESC LIMIT 100").all(userHash)
      .map(r => ({ interaction_id: r.id, ts: r.ts, question: r.question, answer: r.answer, status: r.status, verified: r.verified === 1, model: { name: JSON.parse(String(r.model_json)).label ?? "Bhoomi-LLM v1 checkpoint-160", experimental: true } }));
  }
  close() { this.db.close(); }
}
