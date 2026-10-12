// Request quotas, concurrency limits, timeouts and a spending kill switch for the hosted research beta.
// All state that must survive a restart (daily counters) is held by an injected UsageStore; short windows are in memory.

export interface LimitConfig {
  perMinute: number;            // burst limit per user
  perHour: number;
  perDay: number;               // per user, UTC day
  globalPerDay: number;         // all users
  perUserConcurrent: number;    // in-flight requests per user
  globalConcurrent: number;     // in-flight requests overall (= number of Core workers)
  dailyGpuSecondsBudget: number; // estimated GPU seconds per UTC day, all users (spending safeguard)
  requestTimeoutMs: number;
  maxQuestionChars: number;
  reservationSeconds?: number; // charge conservatively at dispatch; no refund on failure
  monthlyGpuSecondsBudget?: number;
}

export const DEFAULT_LIMITS: LimitConfig = {
  perMinute: 3, perHour: 20, perDay: 40, globalPerDay: 400, perUserConcurrent: 1, globalConcurrent: 2,
  dailyGpuSecondsBudget: 6 * 3600, requestTimeoutMs: 120_000, maxQuestionChars: 1000,
};

export type LimitCode = "kill_switch" | "per_minute" | "per_hour" | "per_day" | "global_day" | "user_busy" | "capacity" | "gpu_budget";
export class LimitError extends Error {
  constructor(public code: LimitCode, public retryAfterSec: number, message: string) { super(message); }
}

export interface UsageStore {
  dayTotals(day: string): { requests: number; gpuSeconds: number };
  userDay(userHash: string, day: string): { requests: number; gpuSeconds: number };
  monthTotal?(month: string): number;
  setting?(key: string, fallback?: string): string;
  setSetting?(key: string, value: string): void;
  add(userHash: string, day: string, requests: number, gpuSeconds: number): void;
}

export class MemoryUsageStore implements UsageStore {
  private u = new Map<string, { requests: number; gpuSeconds: number }>();
  dayTotals(day: string) {
    let requests = 0, gpuSeconds = 0;
    this.u.forEach((v, k) => { if (k.endsWith(`|${day}`)) { requests += v.requests; gpuSeconds += v.gpuSeconds; } });
    return { requests, gpuSeconds };
  }
  userDay(userHash: string, day: string) { return this.u.get(`${userHash}|${day}`) ?? { requests: 0, gpuSeconds: 0 }; }
  add(userHash: string, day: string, requests: number, gpuSeconds: number) {
    const k = `${userHash}|${day}`, v = this.u.get(k) ?? { requests: 0, gpuSeconds: 0 };
    this.u.set(k, { requests: v.requests + requests, gpuSeconds: v.gpuSeconds + gpuSeconds });
  }
}

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const secondsToUtcMidnight = (ms: number) => Math.max(1, Math.ceil((Date.parse(utcDay(ms) + "T00:00:00Z") + 86_400_000 - ms) / 1000));

export class Limiter {
  private stamps = new Map<string, number[]>();
  private inflight = new Map<string, number>();
  private total = 0;
  private paused = false;
  get killed() { return this.usage.setting ? this.usage.setting("paused", "false") === "true" : this.paused; }
  set killed(on: boolean) { this.paused = on; this.usage.setSetting?.("paused", String(on)); }

  constructor(public cfg: LimitConfig, private usage: UsageStore, private now: () => number = Date.now) {}
  isKilled() { return this.killed; }
  setKilled(on: boolean) { this.killed = on; }

  private recent(user: string, windowMs: number): number[] {
    const t = this.now();
    const arr = (this.stamps.get(user) ?? []).filter(s => t - s < 3_600_000);
    this.stamps.set(user, arr);
    return arr.filter(s => t - s < windowMs);
  }

  /** Reserve a slot or throw. The returned release() must be called exactly once with the measured GPU seconds. */
  acquire(user: string, dailyQuota = this.cfg.perDay): { release: (gpuSeconds: number) => void } {
    const t = this.now(), day = utcDay(t);
    if (this.killed) throw new LimitError("kill_switch", 300, "The beta is temporarily paused by the administrators.");
    const g = this.usage.dayTotals(day);
    if (g.requests >= this.cfg.globalPerDay) throw new LimitError("global_day", secondsToUtcMidnight(t), "The beta has reached today's total capacity.");
    if (g.gpuSeconds + (this.cfg.reservationSeconds ?? 0) >= this.cfg.dailyGpuSecondsBudget) throw new LimitError("gpu_budget", secondsToUtcMidnight(t), "Today's compute budget for the beta is used up.");
    if (this.cfg.monthlyGpuSecondsBudget !== undefined && (!this.usage.monthTotal || this.usage.monthTotal(day.slice(0, 7)) + (this.cfg.reservationSeconds ?? 0) > this.cfg.monthlyGpuSecondsBudget))
      throw new LimitError("gpu_budget", 3600, "The pilot compute allowance is unavailable or exhausted.");
    if (this.usage.userDay(user, day).requests >= dailyQuota) throw new LimitError("per_day", secondsToUtcMidnight(t), "Daily question limit reached.");
    if (this.recent(user, 3_600_000).length >= this.cfg.perHour) throw new LimitError("per_hour", 600, "Hourly question limit reached.");
    if (this.recent(user, 60_000).length >= this.cfg.perMinute) throw new LimitError("per_minute", 30, "Please slow down.");
    if ((this.inflight.get(user) ?? 0) >= this.cfg.perUserConcurrent) throw new LimitError("user_busy", 5, "Your previous question is still running.");
    if (this.total >= this.cfg.globalConcurrent) throw new LimitError("capacity", 10, "The model is busy with other users; try again shortly.");
    this.inflight.set(user, (this.inflight.get(user) ?? 0) + 1);
    this.total += 1;
    (this.stamps.get(user) ?? this.stamps.set(user, []).get(user)!).push(t);
    this.usage.add(user, day, 1, this.cfg.reservationSeconds ?? 0);
    let done = false;
    return {
      release: (gpuSeconds: number) => {
        if (done) return;
        done = true;
        this.inflight.set(user, Math.max(0, (this.inflight.get(user) ?? 1) - 1));
        this.total = Math.max(0, this.total - 1);
        if (!this.cfg.reservationSeconds) this.usage.add(user, day, 0, Math.max(0, gpuSeconds));
      },
    };
  }

  snapshot(user: string, dailyQuota = this.cfg.perDay) {
    const day = utcDay(this.now());
    const u = this.usage.userDay(user, day);
    return { day, used_today: u.requests, daily_limit: dailyQuota, remaining_today: Math.max(0, dailyQuota - u.requests),
             per_minute: this.cfg.perMinute, per_hour: this.cfg.perHour };
  }
}

/** Run `fn` but give up (and tell the caller) after timeoutMs. The upstream request is aborted through the signal. */
export async function withTimeout<T>(timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fn(ctl.signal);
  } finally {
    clearTimeout(timer);
  }
}
