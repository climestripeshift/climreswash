import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { registerBetaProxy } from "../server/betaProxy";
import edge from "../deploy/beta/edgeProxy";

test("public integration: disabled beta is closed; public routes unchanged; no remote gateway allowed", async () => {
  const app = express(); registerBetaProxy(app, undefined);
  app.get("/", (_req, res) => res.send("public home"));
  const server = http.createServer(app); await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  try {
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    assert.equal(await (await fetch(base)).text(), "public home");
    assert.equal((await fetch(base + "/bhoomiai/api/chat")).status, 503);
    assert.throws(() => registerBetaProxy(express(), "https://evil.example"), /loopback/);
    assert.throws(() => registerBetaProxy(express(), "http://127.0.0.1:5100/path"), /loopback/);
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});

test("edge routing: only beta API is forwarded; identity and origin key required; headers limited; oversized body denied", async () => {
  const env = { BETA_ORIGIN: "https://private.example.org", BETA_ORIGIN_KEY: "k".repeat(40) };
  assert.equal((await edge.fetch(new Request("https://climreswash.in/"), env)).status, 404);
  assert.equal((await edge.fetch(new Request("https://climreswash.in/bhoomiai/api/me"), env)).status, 401);
  assert.equal((await edge.fetch(new Request("https://evil.example/bhoomiai/api/me", { headers: { "cf-access-jwt-assertion": "signed" } }), env)).status, 404);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (url, init) => {
    calls++; assert.equal(String(url), "https://private.example.org/bhoomiai/api/chat");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("cf-access-jwt-assertion"), "signed");
    assert.equal(headers.get("x-bhoomi-origin-key"), env.BETA_ORIGIN_KEY);
    assert.equal(headers.get("authorization"), null); assert.equal(headers.get("cookie"), null);
    return Response.json({ ok: true });
  }) as typeof fetch;
  try {
    const req = (body: string) => new Request("https://climreswash.in/bhoomiai/api/chat", { method: "POST", headers: { "cf-access-jwt-assertion": "signed", "authorization": "private", cookie: "other_app=private" }, body });
    assert.equal((await edge.fetch(req('{"message":"q"}'), env)).status, 200);
    assert.equal((await edge.fetch(req("x".repeat(20_000)), env)).status, 413);
    assert.equal((await edge.fetch(req("{}"), { ...env, BETA_ORIGIN_KEY: "" })).status, 503);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
