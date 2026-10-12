import type { Express } from "express";

export interface BetaProxyOptions { originKey?: string; publicOrigin?: string; authMode?: "code" | "cloudflare" }
// Only the beta namespace is intercepted, before public sessions/parsers/logging.
export function registerBetaProxy(app: Express, upstream = process.env.BHOOMI_BETA_GATEWAY_URL, fetchImpl = fetch,
  options: BetaProxyOptions = { originKey: process.env.BETA_ORIGIN_KEY, publicOrigin: process.env.BETA_PUBLIC_ORIGIN,
    authMode: process.env.BETA_AUTH_MODE === "code" || process.env.BHOOMI_BETA_COLOCATE === "1" ? "code" : undefined }) {
  let target: URL | undefined;
  let remote = false;
  const codeMode = options.authMode === "code" || (options.authMode !== "cloudflare" && upstream?.startsWith("https://"));
  if (upstream) {
    target = new URL(upstream);
    const loopback = target.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname);
    remote = target.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
    if ((!loopback && !remote) || target.pathname !== "/" || target.username || target.password || target.search || target.hash)
      throw new Error("BHOOMI_BETA_GATEWAY_URL must be a loopback HTTP or fixed HTTPS origin");
    if ((remote || codeMode) && (!options.originKey || options.originKey.length < 32 || !options.publicOrigin || new URL(options.publicOrigin).origin !== options.publicOrigin || !options.publicOrigin.startsWith("https://")))
      throw new Error("HTTPS beta gateway requires an origin key and HTTPS public origin; loopback needs no remote credentials");
  }
  app.use("/bhoomiai", async (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" });
    const api = req.path === "/api" || req.path.startsWith("/api/");
    if (!target) {
      if (api) return res.status(503).json({ message: "The research beta is not enabled." });
      return next();
    }
    // Direct Replit/default-domain requests cannot establish or use custom-domain beta sessions.
    if ((remote || codeMode) && req.header("host")?.toLowerCase() !== new URL(options.publicOrigin!).host.toLowerCase())
      return res.status(403).json({ message: "Use the approved beta address." });
    if (!api && codeMode) return next(); // minimal sign-in shell; data/admin authorization remains at gateway
    try {
      const headers: Record<string, string> = {};
      for (const key of ["origin", "content-type", "sec-fetch-site"]) {
        const value = req.header(key); if (value) headers[key] = value;
      }
      const names = codeMode ? ["BhoomiSession"] : ["CF_Authorization"];
      const cookies = (req.header("cookie") ?? "").split(";").map(s => s.trim()).filter(s => names.some(n => s.startsWith(n + "=")));
      if (cookies.length) headers.cookie = cookies.join("; ");
      if (!codeMode) { const jwt = req.header("cf-access-jwt-assertion"); if (jwt) headers["cf-access-jwt-assertion"] = jwt; }
      if (options.originKey) headers["x-bhoomi-origin-key"] = options.originKey;
      const path = api ? req.originalUrl : "/bhoomiai/api/me";
      if (api && !["GET", "POST"].includes(req.method)) return res.status(405).json({ message: "Method not allowed." });
      let body: Buffer | undefined;
      if (api && req.method === "POST") {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16 * 1024) return res.status(413).json({ message: "Request too large." });
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      const response = await fetchImpl(new URL(path, target), {
        method: api ? req.method : "GET", headers, body, redirect: "manual", signal: AbortSignal.timeout(125_000),
      });
      if (!api) {
        if (!response.ok) return res.status(response.status).send("Sign in with your invited email to access this research beta.");
        const identity = await response.json();
        if (req.path.startsWith("/admin") && identity.role !== "admin") return res.status(403).send("Administrator access required.");
        return next();
      }
      if (codeMode) {
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length) res.setHeader("Set-Cookie", setCookies.filter(s => names.some(n => s.startsWith(n + "="))));
      }
      const content = response.headers.get("content-type") ?? "";
      if (!/^(application\/(json|x-ndjson)|text\/csv)\b/i.test(content)) throw new Error("Invalid beta API response");
      for (const key of ["content-type", "content-disposition", "retry-after"]) {
        const value = response.headers.get(key); if (value) res.set(key, value);
      }
      const data = await response.arrayBuffer();
      if (data.byteLength > 8 * 1024 * 1024) throw new Error("Beta response too large");
      res.status(response.status).send(Buffer.from(data));
    } catch { res.status(503).json({ message: "The research beta is temporarily unavailable." }); }
  });
}
