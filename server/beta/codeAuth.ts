import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, Router } from "express";
import { AccessError } from "./accessJwt";
import { checkAccessCode, hashAccessCode } from "./accessCodes";
import type { PostgresBetaStore } from "./pgStore";
import type { PinAuth } from './pinAuth';

export const sessionCookie = "BhoomiSession";
export const tokenHash = (s: string) => createHash("sha256").update(s).digest("hex");
const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/bhoomiai" };
export function betaCookie(req: Request) {
  const values = (req.header("cookie") ?? "").split(";").map(s => s.trim()).filter(s => s.startsWith(sessionCookie + "="));
  const value = values.length === 1 ? values[0].slice(sessionCookie.length + 1) : "";
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
export class CodeAuth {
  private dummy: Promise<string>;
  constructor(private store: PostgresBetaStore, private origin: string, private sessionSeconds = 8*3600, private now = Date.now, private pinAuth?: PinAuth) {
    if (!origin.startsWith("https://") || new URL(origin).origin !== origin || !Number.isSafeInteger(sessionSeconds) || sessionSeconds < 60 || sessionSeconds > 28800)
      throw new Error("Invalid access-code authentication configuration");
    // Unknown emails still pay the same hashing cost, avoiding a fast user-enumeration branch.
    this.dummy = hashAccessCode(randomBytes(32).toString("hex"));
  }
  register(router: Router) {
    this.pinAuth?.register(router);
    router.post(this.pinAuth ? "/bhoomiai/api/auth/admin/login" : "/bhoomiai/api/auth/login", async (req, res) => {
      if (req.header("origin") !== this.origin || req.header("sec-fetch-site") === "cross-site" || !req.is("application/json"))
        return res.status(403).json({ message: "Forbidden." });
      const body = req.body;
      if (!body || Array.isArray(body) || typeof body.email !== "string" || typeof body.access_code !== "string" ||
        Object.keys(body).some(k => !["email", "access_code"].includes(k)) || body.email.length > 320 || body.access_code.length > 128)
        return res.status(400).json({ message: "Enter your invited email and private access code." });
      const email = body.email.trim().toLowerCase();
      const key = this.store.hash(email), t = this.now();
      // Durable per-email + global throttle. No untrusted forwarded-IP identity; bound hash work across replicas.
      const allowed = await this.store.db.transaction(async () => {
        await this.store.db.prepare("DELETE FROM login_attempts WHERE ts<?").run(t-3600000);
        const row = await this.store.db.prepare(`SELECT COUNT(*) FILTER(WHERE ts>? AND email_hash NOT IN (?,?)) AS total,
          COUNT(*) FILTER(WHERE email_hash=? AND ts>?) AS email FROM login_attempts`)
          .get(t-60000,this.store.hash('shared-pin-failure'),this.store.hash('shared-pin-success'),key,t-900000);
        if (Number(row!.total) >= 20 || Number(row!.email) >= 5) return false;
        await this.store.db.prepare("INSERT INTO login_attempts(email_hash,ts) VALUES(?,?)").run(key,t);
        return true;
      });
      if (!allowed) return res.status(429).set("Retry-After","900").json({ message:"Too many sign-in attempts. Try again later." });
      const record = await this.store.db.prepare("SELECT access_code_hash FROM users WHERE email=?").get(email);
      const encoded = record?.access_code_hash ?? await this.dummy;
      const correct = await checkAccessCode(body.access_code,encoded);
      const sid = randomBytes(32).toString("base64url");
      const expires = t+this.sessionSeconds*1000;
      const ok = await this.store.db.transaction(async () => {
        // Recheck after expensive hashing: rotation/revocation during sign-in must win.
        const user = await this.store.getUser(email);
        const current = await this.store.db.prepare("SELECT access_code_hash FROM users WHERE email=?").get(email);
        if (!correct || !user || (this.pinAuth && user.role !== 'admin') || current?.access_code_hash !== encoded || user.status === "suspended" ||
          (user.expires_at !== null && user.expires_at <= this.now())) return false;
        const old = betaCookie(req);
        if (old) await this.store.db.prepare("DELETE FROM auth_sessions WHERE hash=?").run(tokenHash(old));
        await this.store.db.prepare("INSERT INTO auth_sessions(hash,email,issued_at,expires_at) VALUES(?,?,?,?)").run(tokenHash(sid),email,this.now(),expires);
        await this.store.audit(this.store.hash(email),"code_login");
        return true;
      });
      if (!ok) return res.status(401).json({ message:"Email or access code is incorrect, or access is not approved." });
      res.cookie(sessionCookie,sid,{...cookieOptions,maxAge:this.sessionSeconds*1000});
      res.json({ok:true});
    });
  }
  async authenticate(req: Request): Promise<NonNullable<Request["beta"]>> {
    const sid = betaCookie(req);
    if (!sid) throw new AccessError("missing session");
    const hash = tokenHash(sid), row = await this.store.db.prepare("SELECT * FROM auth_sessions WHERE hash=? AND expires_at>?").get(hash,this.now());
    if (!row || await this.store.tokenRevoked(hash)) throw new AccessError("session expired");
    const user = await this.store.getUser(row.email);
    if (!user || user.status === "suspended" || user.revoked_before >= Number(row.issued_at) || (user.expires_at !== null && user.expires_at <= this.now()))
      throw new AccessError("access revoked");
    if(this.pinAuth && !await this.pinAuth.validateSession(hash,user.role) && user.role!=='admin')
      throw new AccessError('ordinary access-code session disabled');
    return {email:user.email,userHash:this.store.hash(user.email),user,tokenHash:hash,tokenExpiry:Number(row.expires_at),issuedAt:Number(row.issued_at)};
  }
  async logout(req: Request,res: Response) {
    await this.store.db.transaction(async()=>{
      await this.store.revokeToken(req.beta!.tokenHash,req.beta!.tokenExpiry);
      await this.store.db.prepare("DELETE FROM auth_sessions WHERE hash=?").run(req.beta!.tokenHash);
    });
    res.clearCookie(sessionCookie,cookieOptions);
    res.json({ok:true,redirect:"/bhoomiai"});
  }
}
