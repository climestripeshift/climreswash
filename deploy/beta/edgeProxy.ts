// Optional same-domain API routing for an autoscaling public host with no durable beta storage.
// Cloudflare Access protects /bhoomiai and /bhoomiai/* before this Worker runs.
export interface EdgeEnv { BETA_ORIGIN: string; BETA_ORIGIN_KEY: string }
export default {
  async fetch(request: Request, env: EdgeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname !== "climreswash.in" || !(url.pathname === "/bhoomiai/api" || url.pathname.startsWith("/bhoomiai/api/"))) return new Response("Not found", { status: 404 });
    if (!["GET", "POST"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    const jwt = request.headers.get("cf-access-jwt-assertion");
    if (!jwt) return new Response("Sign-in required", { status: 401 });
    try {
      const origin = new URL(env.BETA_ORIGIN);
      if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password || !env.BETA_ORIGIN_KEY || env.BETA_ORIGIN_KEY.length < 32) throw new Error();
      const headers = new Headers({ "cf-access-jwt-assertion": jwt, "x-bhoomi-origin-key": env.BETA_ORIGIN_KEY });
      for (const key of ["content-type", "origin", "sec-fetch-site"]) {
        const value = request.headers.get(key); if (value) headers.set(key, value);
      }
      let body: Uint8Array | undefined;
      if (request.method === "POST") {
        if (Number(request.headers.get("content-length")) > 16 * 1024) return new Response("Request too large", { status: 413 });
        const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        if (reader) for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.length; if (size > 16 * 1024) { await reader.cancel(); return new Response("Request too large", { status: 413 }); }
          chunks.push(value);
        }
        body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
      }
      const upstream = await fetch(new URL(url.pathname + url.search, origin), { method: request.method, headers, body, redirect: "error", signal: AbortSignal.timeout(125_000) });
      const output = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      for (const key of ["content-type", "content-disposition", "retry-after"]) { const value = upstream.headers.get(key); if (value) output.set(key, value); }
      return new Response(upstream.body, { status: upstream.status, headers: output });
    } catch { return Response.json({ message: "The research beta is temporarily unavailable." }, { status: 503 }); }
  },
};
