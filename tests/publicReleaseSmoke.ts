// Exercise the actual production bundle without production secrets, databases, providers or GPU resources.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

const root = process.cwd();
assert.ok(fs.existsSync(path.join(root, "dist/index.cjs")), "Run npm run build first");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "climreswash-smoke-"));
const syntheticApproval = path.join(temporary, "approval.json");
fs.writeFileSync(syntheticApproval, JSON.stringify({ approved: true, data_bundle_sha256: "a".repeat(64),
  endpoint: "https://api.runpod.ai/v2/smokeonly/openai/v1", served_model: "bhoomi-llm-v1-ckpt160",
  model: { adapter_sha256: "b".repeat(64) } }), { mode: 0o600 });

const syntheticConfig = {
  BHOOMI_BETA_COLOCATE: "1", BETA_DATABASE_URL: "postgresql://smoke@127.0.0.1:1/smoke",
  BETA_HASH_KEY: "synthetic-hash-".repeat(3), BETA_ORIGIN_KEY: "synthetic-origin-".repeat(3),
  BETA_PUBLIC_ORIGIN: "https://release.example.org", BETA_RUN_DIR: temporary,
};
const cases: [string, NodeJS.ProcessEnv][] = [
  ["beta disabled", { BHOOMI_BETA_COLOCATE: "0", BETA_CLOUD_APPROVED: "0" }],
  ["showcase configured; gateway unavailable", { ...syntheticConfig, BETA_CLOUD_APPROVED: "0", BHOOMI_DEMO_ENABLED: "1",
    BHOOMI_DEMO_ENDPOINT: "https://smokeonly-8000.proxy.runpod.net/v1/chat/completions",
    BHOOMI_DEMO_EDGE_KEY: "synthetic-demo-edge-".repeat(3), BHOOMI_DEMO_UNTIL: new Date(Date.now() + 20 * 60_000).toISOString() }],
  ["missing beta secrets", { BHOOMI_BETA_COLOCATE: "1" }],
  ["missing approval manifest", { ...syntheticConfig, BETA_CLOUD_APPROVED: "1" }],
  ["missing provider credentials", { ...syntheticConfig, BETA_CLOUD_APPROVED: "1",
    BETA_APPROVAL_MANIFEST: syntheticApproval, RELAY_UPSTREAM: "https://api.runpod.ai/v2/smokeonly/openai/v1",
    RELAY_MODEL: "bhoomi-llm-v1-ckpt160" }],
];

async function unusedPort() {
  const probe = http.createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  return port;
}

try {
  for (const [label, betaEnv] of cases) {
    const port = await unusedPort();
    // Whitelist the environment: never inherit real DATABASE_URL, beta secrets or provider keys.
    const child = spawn(process.execPath, ["--require", path.join(root, "tests/fixtures/releaseNoNetwork.cjs"), "dist/index.cjs"], {
      cwd: root, env: { PATH: process.env.PATH, NODE_ENV: "production", PORT: String(port),
        DATABASE_URL: "postgresql://smoke@127.0.0.1:1/smoke", SESSION_SECRET: "synthetic-release-session",
        ...betaEnv }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", chunk => { output += String(chunk); });
    child.stderr.on("data", chunk => { output += String(chunk); });
    const exited = once(child, "exit");
    try {
      const deadline = Date.now() + 30_000;
      while (!output.includes("serving on port")) {
        assert.equal(child.exitCode, null, output);
        assert.ok(Date.now() < deadline, "Production startup timed out: " + output);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const get = (route: string) => fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(10_000) });
      for (const route of ["/", "/grid", "/forecast", "/simulator", "/technology"]) {
        const response = await get(route);
        assert.equal(response.status, 200, `${label}: ${route}`);
        assert.match(await response.text(), /<div id="root"><\/div>/);
      }
      for (const route of ["/data/india.json", "/data/india_hex_props.json", "/data/hex_states/rajasthan.json", "/data/forecast_risk.json"]) {
        const response = await get(route);
        assert.equal(response.status, 200, `${label}: ${route}`);
        assert.match(response.headers.get("content-type") ?? "", /json/);
        assert.ok(await response.json(), `${label}: map JSON must parse`);
      }
      // Existing mock endpoints verify API registration; live database-backed APIs are deliberately not exercised here.
      const forecast = await get("/api/imd/forecast/Rajasthan");
      assert.equal(forecast.status, 200); assert.equal((await forecast.json()).region, "Rajasthan");
      const groundwater = await get("/api/groundwater/levels/Kota");
      assert.equal(groundwater.status, 200); assert.equal((await groundwater.json()).district, "Kota");
      // Use the configured custom-domain Host; failure must close the actual proxy path, not just reject a wrong Host.
      const betaRequest = (route: string, body?: object) => new Promise<Response>((resolve, reject) => {
        const data = body ? JSON.stringify(body) : undefined;
        const request = http.request(`http://127.0.0.1:${port}${route}`, { method: body ? "POST" : "GET",
          headers: { Host: new URL(betaEnv.BETA_PUBLIC_ORIGIN ?? "https://climreswash.in").host,
            Origin: betaEnv.BETA_PUBLIC_ORIGIN ?? "https://climreswash.in", "Content-Type": "application/json",
            ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) } }, incoming => {
          const chunks: Buffer[] = []; incoming.on("data", c => chunks.push(c)); incoming.on("error", reject);
          incoming.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode })));
        }); request.on("error", reject); request.end(data);
      });
      for (const route of ["/bhoomiai/api/me", "/bhoomiai/api/history", "/bhoomiai/api/admin/export"]) {
        assert.equal((await betaRequest(route)).status, 503, `${label}: ${route} must be closed`);
      }
      for (const route of ["/bhoomiai/api/chat", "/bhoomiai/api/demo/chat", "/bhoomiai/api/auth/login"]) {
        const response = await betaRequest(route, { message: "synthetic test" });
        assert.equal(response.status, 503, `${label}: ${route} must be closed`);
      }
      console.log(`PASS: ${label}; production pages, map data and mock APIs available; beta APIs closed`);
    } catch (error) {
      console.error(`Smoke case failed: ${label}\n${output}`);
      throw error;
    } finally {
      child.kill("SIGTERM");
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      await exited;
      clearTimeout(killTimer);
    }
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
