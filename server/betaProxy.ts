import type { Express } from "express";

// Integrates only the protected Bhoomi namespace. No dependency on SQLite/Core in the public Node process.
export function registerBetaProxy(app: Express, upstream = process.env.BHOOMI_BETA_GATEWAY_URL, fetchImpl = fetch) {
  let target: URL | undefined;
  if (upstream) {
    target = new URL(upstream);
    if (target.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || target.pathname !== "/" || target.username || target.password || target.search || target.hash)
      throw new Error("BHOOMI_BETA_GATEWAY_URL must be a loopback HTTP origin");
  }
  app.use("/bhoomiai", async (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" });
    const api = req.path === "/api" || req.path.startsWith("/api/");
    if (!target) {
      if (api) return res.status(503).json({ message: "The research beta is not enabled." });
      return next();
    }
    try {
      const headers: Record<string, string> = {};
      // Never forward arbitrary origin headers, alternate identity headers, keys or cookies from unrelated apps.
      for (const key of ["cf-access-jwt-assertion", "origin", "content-type", "sec-fetch-site"]) {
        const value = req.header(key); if (value) headers[key] = value;
      }
      const cookie = req.header("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith("CF_Authorization="));
      if (cookie) headers.cookie = cookie;
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
        method: api ? req.method : "GET", headers, body, redirect: "error", signal: AbortSignal.timeout(125_000),
      });
      if (!api) {
        if (!response.ok) return res.status(response.status).send("Sign in with your invited email to access this research beta.");
        const identity = await response.json();
        if (req.path.startsWith("/admin") && identity.role !== "admin") return res.status(403).send("Administrator access required.");
        return next();
      }
      for (const key of ["content-type", "content-disposition", "retry-after"]) {
        const value = response.headers.get(key); if (value) res.set(key, value);
      }
      res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
    } catch { res.status(503).json({ message: "The research beta is temporarily unavailable." }); }
  });
}
