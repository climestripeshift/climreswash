// Verification of the Cloudflare Access JWT (header `Cf-Access-Jwt-Assertion`) at the origin.
// Cloudflare authenticates the invited person (email one-time PIN) before traffic reaches the origin; the origin must still
// verify the signed token, so a request that bypasses Cloudflare (or forges a header) is rejected.
// Checks: RS256 only, signature against the team's published keys (matched by kid), iss, aud (the Access application tag),
// exp / nbf with a small clock skew. No third-party dependency: Node's crypto verifies JWKs directly.
import { createPublicKey, verify as cryptoVerify } from "node:crypto";

export interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string; use?: string }
export interface AccessConfig { teamDomain: string; aud: string; clockSkewSec?: number }
export type JwksFetcher = () => Promise<{ keys: Jwk[] }>;
export interface AccessIdentity { email: string; sub: string; exp: number; iat: number }

export class AccessError extends Error {
  constructor(public reason: string) { super(reason); }
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const parseJson = (b: Buffer) => { try { return JSON.parse(b.toString("utf8")); } catch { throw new AccessError("malformed token"); } };

/** Keys are cached for `ttlMs`; an unknown kid triggers at most one refetch per `minRefetchMs` (key rotation). */
export function cachedJwks(fetcher: JwksFetcher, ttlMs = 3_600_000, minRefetchMs = 60_000, now: () => number = Date.now): JwksFetcher {
  let cache: { keys: Jwk[] } | null = null, at = 0, lastTry = 0;
  return async () => {
    const t = now();
    if (!cache || t - at > ttlMs || (t - lastTry > minRefetchMs && cache.keys.length === 0)) {
      lastTry = t;
      cache = await fetcher();
      at = t;
    }
    return cache;
  };
}

export async function verifyAccessJwt(
  token: string | undefined, cfg: AccessConfig, getJwks: JwksFetcher, nowSec: number = Math.floor(Date.now() / 1000),
): Promise<AccessIdentity> {
  if (!token || typeof token !== "string" || token.length > 8192) throw new AccessError("missing token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new AccessError("malformed token");
  const header = parseJson(b64url(parts[0]));
  const payload = parseJson(b64url(parts[1]));
  if (!header || !payload || typeof header !== "object" || typeof payload !== "object") throw new AccessError("malformed token");
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new AccessError("unsupported algorithm");
  const jwks = await getJwks();
  const jwk = jwks.keys.find(k => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) throw new AccessError("unknown key id");
  let ok = false;
  try {
    const key = createPublicKey({ key: jwk as unknown as Record<string, unknown>, format: "jwk" } as never);
    ok = cryptoVerify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, b64url(parts[2]));
  } catch { ok = false; }
  if (!ok) throw new AccessError("bad signature");
  const skew = cfg.clockSkewSec ?? 60;
  if (payload.iss !== `https://${cfg.teamDomain}`) throw new AccessError("wrong issuer");
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(cfg.aud)) throw new AccessError("wrong audience");
  if (typeof payload.exp !== "number" || payload.exp + skew < nowSec) throw new AccessError("token expired");
  if (typeof payload.nbf === "number" && payload.nbf - skew > nowSec) throw new AccessError("token not yet valid");
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!/^[^@\s]{1,64}@[^@\s]{1,255}$/.test(email)) throw new AccessError("no email claim");
  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || payload.iat > nowSec + skew) throw new AccessError("invalid issue time");
  return { email, sub: String(payload.sub ?? ""), exp: payload.exp, iat: payload.iat };
}
