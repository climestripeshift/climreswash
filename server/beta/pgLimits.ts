import { randomBytes } from "node:crypto";
import { LimitError, utcDay, type LimitConfig } from "./limits";
import type { PostgresBetaStore } from "./pgStore";

export class PostgresLimiter {
  constructor(public cfg: LimitConfig, private store: PostgresBetaStore, private now = Date.now) {}
  // The relay persists its own stop (`relay_paused`) after an identity mismatch or provider failure; the gateway honours it at
  // admission so no quota or GPU seconds are reserved for requests that cannot be served. Operator resume clears both.
  async isKilled() {
    const [paused, relay] = await Promise.all([this.store.setting("paused", "false"), this.store.setting("relay_paused", "false")]);
    return paused === "true" || relay === "true";
  }
  async setKilled(on: boolean) {
    await this.store.setSetting("paused", String(on));
    if (!on) await this.store.setSetting("relay_paused", "false");
  }
  async snapshot(user: string, dailyQuota = this.cfg.perDay) {
    const day = utcDay(this.now()), u = await this.store.userDay(user, day);
    return { day, used_today: u.requests, daily_limit: dailyQuota, remaining_today: Math.max(0, dailyQuota - u.requests),
      per_minute: this.cfg.perMinute, per_hour: this.cfg.perHour };
  }
  async acquire(user: string, dailyQuota = this.cfg.perDay) {
    const id = randomBytes(24).toString("hex"), t = this.now(), day = utcDay(t), s = this.store, c = this.cfg;
    const deny = (code: ConstructorParameters<typeof LimitError>[0]) => { throw new LimitError(code, 60, "The beta request limit has been reached."); };
    await s.db.transaction(async () => {
      if (await this.isKilled()) deny("kill_switch");
      const current = await s.db.prepare("SELECT status,daily_quota,expires_at FROM users WHERE user_hash=?").get(user);
      if (!current || current.status === "suspended" || (current.expires_at !== null && Number(current.expires_at) <= t)) deny("kill_switch");
      const quota = current!.daily_quota === null ? dailyQuota : Number(current!.daily_quota);
      const g = await s.dayTotals(day), u = await s.userDay(user, day);
      if (g.requests >= c.globalPerDay) deny("global_day");
      if (u.requests >= quota) deny("per_day");
      const reserve = c.reservationSeconds ?? c.requestTimeoutMs / 1000;
      if (g.gpuSeconds + reserve > c.dailyGpuSecondsBudget) deny("gpu_budget");
      if (c.monthlyGpuSecondsBudget !== undefined && await s.monthTotal(day.slice(0, 7)) + reserve > c.monthlyGpuSecondsBudget) deny("gpu_budget");
      const row = await s.db.prepare(`SELECT
        COUNT(*) FILTER(WHERE released=0 AND expires_at>?) AS active,
        COUNT(*) FILTER(WHERE released=0 AND expires_at>? AND user_hash=?) AS mine,
        COUNT(*) FILTER(WHERE admitted_at>? AND user_hash=?) AS minute,
        COUNT(*) FILTER(WHERE admitted_at>? AND user_hash=?) AS hour FROM request_leases`).get(t,t,user,t-60000,user,t-3600000,user);
      if (Number(row!.active) >= c.globalConcurrent) deny("capacity");
      if (Number(row!.mine) >= c.perUserConcurrent) deny("user_busy");
      if (Number(row!.minute) >= c.perMinute) deny("per_minute");
      if (Number(row!.hour) >= c.perHour) deny("per_hour");
      await s.add(user, day, 1, reserve); // no refund on timeout/uncertain dispatch
      await s.db.prepare("INSERT INTO request_leases(id,user_hash,admitted_at,expires_at) VALUES(?,?,?,?)").run(id,user,t,t+c.requestTimeoutMs+60000);
    });
    return { release: async (_seconds: number) => { await s.db.prepare("UPDATE request_leases SET released=1 WHERE id=?").run(id); } };
  }
}
