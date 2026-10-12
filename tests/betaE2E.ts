// Full browser flow against the existing application's production client build and real JWT verifier.
// The identity provider keys and Core are mocked ONLY in this test. No GPU/network provider is called.
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import path from "node:path";
import { generateKeyPairSync, createSign, randomBytes } from "node:crypto";
import { createBetaRouter, type BetaConfig } from "../server/beta/gateway";
import { BetaStore } from "../server/beta/store";
import { DEFAULT_LIMITS, Limiter } from "../server/beta/limits";
import { registerBetaProxy } from "../server/betaProxy";

const playwrightPath = process.env.PLAYWRIGHT_MODULE;
if (!playwrightPath) throw new Error("Set PLAYWRIGHT_MODULE to the installed playwright-core module path");
const { chromium } = await import(playwrightPath);
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const key = { ...pair.publicKey.export({ format: "jwk" }), kid: "test", kty: "RSA" };
const token = (email: string) => {
  const now = Math.floor(Date.now() / 1000);
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = encode({ alg: "RS256", kid: "test" });
  const body = encode({ email, sub: email, iss: "https://test.cloudflareaccess.com", aud: ["test-aud"], iat: now, exp: now + 3600 });
  return `${head}.${body}.${createSign("RSA-SHA256").update(`${head}.${body}`).sign(pair.privateKey).toString("base64url")}`;
};
const store = new BetaStore(":memory:", randomBytes(32).toString("hex"));
for (const [email, role] of [["owner@example.org", "admin"], ["alice@example.org", "user"], ["bob@example.org", "user"]] as const) store.invite(email, role, "test");
const config: BetaConfig = {
  hosted: true, authMode: "cloudflare", access: { teamDomain: "test.cloudflareaccess.com", aud: "test-aud" },
  getJwks: async () => ({ keys: [key as any] }), inferenceReady: true, coreUrl: "http://127.0.0.1:8765",
  limits: { ...DEFAULT_LIMITS, perMinute: 30 },
  model: { label: "Bhoomi-LLM v1 checkpoint-160", experimental: true, baseModel: "Qwen3-4B-Instruct-2507", note: "Experimental; independent review required." },
};
const listen = async (app: express.Express) => {
  const server = http.createServer(app); await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${(server.address() as any).port}` };
};
const gateway = express(); gateway.use(express.json({ limit: "16kb" }));
gateway.use(createBetaRouter({ store, config, limiter: new Limiter(config.limits, store), fetchImpl: (async () => new Response(JSON.stringify({
  interaction_id: randomBytes(16).toString("hex"), session_id: randomBytes(12).toString("hex"), status: "verified",
  answer: "Kota, Rajasthan: hazard index 4.03 [F1].", evidence: "Tool-grounded test fixture.", verification: { passed: true },
  model: { name: "bhoomi-llm-v1-ckpt160", registry_id: "test-registry", experimental: true, deployable: false }, tool_trace: [], latency_s: 0.1,
}))) as typeof fetch }));
const gw = await listen(gateway);
const site = express(); registerBetaProxy(site, gw.url);
site.use(express.static(path.resolve("dist/public")));
site.get("*", (_req, res) => res.sendFile(path.resolve("dist/public/index.html")));
const web = await listen(site); config.publicOrigin = web.url;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const anonymous = await browser.newContext();
  const anonPage = await anonymous.newPage();
  assert.equal((await anonPage.goto(web.url + "/bhoomiai"))!.status(), 401);
  assert.equal((await anonPage.goto(web.url + "/"))!.status(), 200);
  assert.equal((await anonymous.request.get(web.url + "/bhoomiai/api/history")).status(), 401);
  const context = async (email: string) => browser.newContext({ extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": token(email) } });
  const alice = await context("alice@example.org"), page = await alice.newPage();
  await page.goto(web.url + "/bhoomiai");
  await page.getByTestId("consent").waitFor();
  await page.getByTestId("consent").locator('input[type="checkbox"]').first().check();
  assert.equal(await page.getByTestId("consent").locator('input[type="checkbox"]').nth(1).isChecked(), false);
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await page.getByLabel("Question").fill("What is the hazard index of Kota?");
  await page.getByLabel("Question").press("Enter");
  await page.getByText("Kota, Rajasthan: hazard index 4.03", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Not helpful", exact: true }).click();
  const feedback = page.getByTestId("feedback-form"); await feedback.locator("summary").click();
  await feedback.getByText("A figure is incorrect", { exact: true }).click();
  await feedback.locator("textarea").nth(1).fill("Check against the source figure.");
  await feedback.getByRole("button", { name: "Send feedback" }).click();
  await page.getByText("Thank you: feedback recorded for review.").waitFor();
  assert.equal((await alice.request.get(web.url + "/bhoomiai/admin")).status(), 403);
  assert.equal((await alice.request.get(web.url + "/bhoomiai/api/admin/export")).status(), 403);
  const bob = await context("bob@example.org");
  assert.equal((await bob.request.get(web.url + "/bhoomiai/api/history")).status(), 428);
  const admin = await context("owner@example.org"), adminPage = await admin.newPage();
  await adminPage.goto(web.url + "/bhoomiai/admin");
  await adminPage.getByTestId("beta-admin").waitFor();
  await adminPage.getByText("Check against the source figure.", { exact: false }).first().waitFor();
  const row = adminPage.locator("li").filter({ hasText: "alice@example.org" });
  await row.getByRole("button", { name: "Revoke access", exact: true }).click();
  await adminPage.getByText("Access revoked immediately.").waitFor();
  assert.equal((await alice.request.get(web.url + "/bhoomiai/api/history")).status(), 403);
  const exported = await admin.request.get(web.url + "/bhoomiai/api/admin/export?format=jsonl");
  assert.equal(exported.status(), 200); assert.equal(JSON.parse(await exported.text()).training_use_authorized, false);
  await adminPage.screenshot({ path: "/tmp/bhoomi-admin-e2e.png", fullPage: true });
  const logout = await admin.request.post(web.url + "/bhoomiai/api/logout", { data: {}, headers: { Origin: web.url } });
  assert.equal(logout.status(), 200); assert.equal((await logout.json()).redirect, "/cdn-cgi/access/logout");
  assert.equal((await admin.request.get(web.url + "/bhoomiai/api/me")).status(), 401);
  console.log("PASS: existing-app deep links, public home, verified identity, consent, chat, correction, admin review/export, revocation, isolation and logout");
} finally {
  await browser.close(); gw.server.closeAllConnections(); web.server.closeAllConnections();
  await Promise.all([new Promise<void>(r => gw.server.close(() => r())), new Promise<void>(r => web.server.close(() => r()))]); store.close();
}
