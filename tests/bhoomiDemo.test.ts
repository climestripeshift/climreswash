import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { randomInt } from 'node:crypto';
import { spawn } from 'node:child_process';
import { ShowcaseDemo, DEMO_MODEL, demoEndpoint, loadDemoData, DEMO_BUNDLE_SHA256 } from '../server/beta/demo';
import { demoTestStore } from './fixtures/demoStore';
import { PinAuth, configureSharedPin } from '../server/beta/pinAuth';
import { CodeAuth } from '../server/beta/codeAuth';
import { createBetaRouter, type BetaConfig } from '../server/beta/gateway';
import { DEFAULT_LIMITS, Limiter, MemoryUsageStore } from '../server/beta/limits';
import { prepareColocatedBeta } from '../server/beta/supervisor';
import type { Conversations } from '../server/beta/conversations';
const origin = 'https://climreswash.in';
const endpoint = 'https://localtest-8000.proxy.runpod.net/v1/chat/completions';
const edge = 'local-test-edge-key-'.repeat(3);
const enabledEnv = (now = Date.now()) => ({ BHOOMI_DEMO_ENABLED: '1', BHOOMI_DEMO_ENDPOINT: endpoint, BHOOMI_DEMO_EDGE_KEY: edge, BHOOMI_DEMO_UNTIL: new Date(now + 20 * 60_000).toISOString() });
const toolReply = (name = 'district_hazard_profile', args = { district: 'SYNTHETIC District Alpha', state: 'SYNTHETIC State' }) =>
  Response.json({ model: DEMO_MODEL, choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-original', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const finalReply = () => Response.json({ model: DEMO_MODEL, choices: [{ message: { role: 'assistant', content: 'Unsafe generated forecast 9999, Bearer ' + edge } }] });
const fixtureFetch = (() => { let n = 0; return async () => ++n % 2 ? toolReply() : finalReply(); })() as typeof fetch;

test('archive preserved; production target only permits the authenticated Runpod gate', () => {
  assert.equal(DEMO_BUNDLE_SHA256, '3e5ea5c9f67c82fb24e2578793dd87c073104242512bb3d7364f9410b7c274a5');
  assert.equal(loadDemoData().hex_risk, 2.5);
  assert.equal(demoEndpoint(endpoint).href, endpoint);
  for (const u of ['http://127.0.0.1:18091/v1/chat/completions', 'https://evil.example/v1/chat/completions', endpoint + '?key=x', endpoint.replace('8000', '8001'), endpoint.replace('/v1/chat/completions', '/invocations')]) assert.throws(() => demoEndpoint(u));
});

test('demo defaults off, expiry and durable emergency switch survive new instances', async () => {
  const { store, sql } = demoTestStore();
  try {
    const disabled = new ShowcaseDemo(store, { env: {}, fetchImpl: async () => { throw new Error('must not dispatch'); } });
    assert.equal((await disabled.status()).enabled, false); await assert.rejects(disabled.answer('a', 'hello'), /off/);
    const env = enabledEnv(), demo = new ShowcaseDemo(store, { env, fetchImpl: fixtureFetch });
    const answer = await demo.answer('a', 'question'); assert.match(answer.answer, /DEMONSTRATION DATA/); assert.match(answer.answer, /2\.5/);
    assert.ok(!answer.answer.includes('9999')); assert.ok(!JSON.stringify(answer).includes(edge));
    await assert.rejects(demo.answer('b', 'followup', answer.session_id), /session/);
    await demo.off(); assert.equal((await new ShowcaseDemo(store, { env }).status()).enabled, false);
    env.BHOOMI_DEMO_UNTIL = new Date(Date.now() - 1).toISOString(); assert.equal((await demo.status()).enabled, false);
  } finally { sql.close(); }
});

test('global admission serializes replicas, retains caps across restarts and fails closed on unknown tools or identity', async () => {
  const { store, sql } = demoTestStore(); const env = enabledEnv();
  let unblock!: () => void; const wait = new Promise<void>(r => { unblock = r; }); let calls = 0;
  const demo = new ShowcaseDemo(store, { env, fetchImpl: (async () => { calls++; if (calls === 1) { await wait; return toolReply(); } return finalReply(); }) as typeof fetch });
  const replica = new ShowcaseDemo(store, { env, fetchImpl: fixtureFetch });
  try {
    const first = demo.answer('a', 'question');
    while (!calls) await new Promise(r => setTimeout(r, 5));
    await assert.rejects(replica.answer('b', 'question'), /busy/); unblock(); await first;
    for (let i = 0; i < 5; i++) await replica.answer('b', 'question');
    await assert.rejects(new ShowcaseDemo(store, { env }).answer('c', 'question'), /limit/);
    const s = JSON.parse(await store.setting('showcase_demo_control')); s.hits = []; s.total = 30; await store.setSetting('showcase_demo_control', JSON.stringify(s));
    await assert.rejects(replica.answer('b', 'question'), /limit/);
    s.total = 0; await store.setSetting('showcase_demo_control', JSON.stringify(s));
    const unsafe = new ShowcaseDemo(store, { env, fetchImpl: (async () => toolReply('read_file', {} as any)) as typeof fetch });
    await assert.rejects(unsafe.answer('a', 'question'), /invalid tool/); assert.equal((await replica.status()).enabled, false);
  } finally { unblock(); sql.close(); }
});

test('PIN login → showcase route → actual checkpoint-160 tool call → synthetic result → labelled answer (CPU)', { skip: process.env.BHOOMI_DEMO_CPU_E2E !== '1' }, async () => {
  const { store, sql } = demoTestStore();
  // Test transport alone rewrites the fixed HTTPS destination to the real, authenticated gate on loopback.
  // No production configuration accepts a loopback upstream. No provider, production DB, secrets or GPU are used.
  const gate = spawn('python3', ['-c', 'import sys; sys.path.insert(0,"deploy/beta/gpu-compatibility"); import pod_gate; pod_gate.make_server("127.0.0.1",18092,"http://127.0.0.1:18091",sys.argv[1],"cpu-internal-test-key",80).serve_forever()', edge], { stdio: 'ignore' });
  const trace: any[] = [];
  const transport = (async (url: any, init: RequestInit) => {
    assert.equal(String(url), endpoint); assert.equal((init.headers as any).Authorization, 'Bearer ' + edge);
    trace.push(JSON.parse(init.body as string));
    return fetch('http://127.0.0.1:18092/v1/chat/completions', init);
  }) as typeof fetch;
  const demo = new ShowcaseDemo(store, { env: enabledEnv(), fetchImpl: transport });
  const config: BetaConfig = { hosted: true, authMode: 'code', originKey: 'local-ingress-key-'.repeat(3), publicOrigin: origin,
    codeAuth: new CodeAuth(store, origin, 60, Date.now, new PinAuth(store, origin, 60)), conversations: {} as Conversations,
    inferenceReady: false, demo, limits: DEFAULT_LIMITS, model: { label: 'beta not approved', experimental: true, baseModel: 'Qwen3-4B', note: 'research gates unchanged' } };
  const app = express(); app.use(express.json({ limit: '16kb' })); app.use(createBetaRouter({ store, config, limiter: new Limiter(DEFAULT_LIMITS, new MemoryUsageStore()) }));
  const server = http.createServer(app); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + (server.address() as any).port;
  const req = (p: string, body?: object, cookie = '', extra = {}) => fetch(base + '/bhoomiai/api' + p, { method: body ? 'POST' : 'GET', headers: { Origin: origin, 'x-bhoomi-origin-key': config.originKey!, Cookie: cookie, 'Content-Type': 'application/json', ...extra }, body: body ? JSON.stringify(body) : undefined });
  try {
    const pin = String(randomInt(1_000_000)).padStart(6, '0');
    await configureSharedPin(store, pin, 'local-test');
    // Wait only for the local gate, which never reaches the CPU model on unauthorized requests.
    for (let i = 0; i < 100; i++) { try { if ((await fetch('http://127.0.0.1:18092/v1/models')).status === 401) break; } catch {} await new Promise(r => setTimeout(r, 50)); }
    assert.equal((await req('/demo/chat', { message: 'hello' })).status, 401);
    const login = await req('/auth/login', { pin }); assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(s => s.split(';')[0]).join('; '); assert.match(login.headers.getSetCookie()[0], /HttpOnly/);
    assert.equal((await req('/demo/chat', { message: 'hello' }, cookie, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await req('/demo/off', {}, cookie)).status, 403);
    const result = await req('/demo/chat', { message: 'What is the invented overall screening index for SYNTHETIC District Alpha in SYNTHETIC State?' }, cookie);
    const answer = await result.json(); assert.equal(result.status, 200, JSON.stringify(answer));
    assert.match(answer.answer, /DEMONSTRATION DATA/); assert.match(answer.answer, /2\.5/); assert.match(answer.answer, /not probabilities/);
    assert.equal(answer.status, 'demonstration'); assert.equal(answer.verification.passed, false);
    assert.equal(answer.model.name, DEMO_MODEL); assert.equal(answer.tool_trace[0].calls[0].name, 'district_hazard_profile');
    assert.ok(trace[1].messages.some((m: any) => m.role === 'tool' && JSON.parse(m.content).overall_screening_index === 2.5));
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM interactions').get()!.n, 0);
    assert.equal((await req('/history', undefined, cookie)).status, 428);
    assert.equal((await req('/consent', { version: (await (await req('/me', undefined, cookie)).json()).consent.required_version, research: true, training: false }, cookie)).status, 200);
    assert.equal((await req('/chat', { message: 'production request' }, cookie)).status, 503);
    assert.equal(trace.length, 2);
    const followup = await req('/demo/chat', { message: 'Why is that invented index not a probability?', session_id: answer.session_id }, cookie);
    const followupAnswer = await followup.json(); assert.equal(followup.status, 200, JSON.stringify(followupAnswer));
    assert.match(followupAnswer.answer, /DEMONSTRATION DATA/); assert.match(followupAnswer.answer, /not probabilities/);
    assert.equal(followupAnswer.session_id, answer.session_id); assert.ok(trace[2].messages.some((m: any) => m.role === 'tool'));
    assert.equal(trace.length, 4);
    await configureSharedPin(store, null, 'local-test'); assert.equal((await req('/demo/chat', { message: 'hello' }, cookie)).status, 401);
    console.log('CPU E2E: real checkpoint-160 selected district_hazard_profile; synthetic 2.5 returned; research inference still blocked.');
  } finally { gate.kill('SIGTERM'); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); sql.close(); }
});

test('real districts remain unavailable; generated secrets/prose never reach replies; upstream failures latch off', async () => {
  const { store, sql } = demoTestStore(); const env = enabledEnv(); let n = 0;
  try {
    const demo = new ShowcaseDemo(store, { env, fetchImpl: (async () => ++n % 2 ? toolReply('district_hazard_profile', { district: 'Kota', state: 'Rajasthan' }) : finalReply()) as typeof fetch });
    const result = await demo.answer('a', 'Give me real Kota forecasts');
    assert.match(result.answer, /unavailable/); assert.ok(!result.answer.includes('2.5')); assert.ok(!result.answer.includes('9999'));
    const failing = new ShowcaseDemo(store, { env, fetchImpl: (async () => { throw new Error('Bearer ' + edge); }) as typeof fetch });
    await assert.rejects(failing.answer('a', 'hello')); assert.equal((await demo.status()).enabled, false);
  } finally { sql.close(); }
});

test('emergency off aborts active fetch and uncertain expired leases never admit new model work', async () => {
  const { store, sql } = demoTestStore(); const env = enabledEnv(); let started!: () => void;
  const ready = new Promise<void>(r => { started = r; }); let aborted = false;
  try {
    const demo = new ShowcaseDemo(store, { env, fetchImpl: (async (_u: any, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true }); started();
    })) as typeof fetch });
    const pending = demo.answer('a', 'hello'); const rejection = assert.rejects(pending); await ready; await demo.off(); await rejection;
    assert.equal(aborted, true); assert.equal((await new ShowcaseDemo(store, { env }).status()).enabled, false);
    await store.setSetting('showcase_demo_control', JSON.stringify({ activation: env.BHOOMI_DEMO_UNTIL, off: false, total: 1, hits: [], lease: { id: 'crashed-request', until: Date.now() - 1 } }));
    const replica = new ShowcaseDemo(store, { env, fetchImpl: async () => { throw new Error('must not dispatch'); } });
    await assert.rejects(replica.answer('b', 'hello'), /busy/); assert.equal((await replica.status()).enabled, false);
  } finally { sql.close(); }
});

test('showcase co-location starts only the existing gateway and excludes production provider keys', () => {
  const env = { ...enabledEnv(), BHOOMI_BETA_COLOCATE: '1', BETA_DATABASE_URL: 'postgresql://fixture@127.0.0.1/existing',
    BETA_HASH_KEY: 'local-hash-key-'.repeat(4), BETA_ORIGIN_KEY: 'local-origin-key-'.repeat(4), BETA_PUBLIC_ORIGIN: origin,
    RUNPOD_API_KEY: 'must-not-inherit', RELAY_UPSTREAM_KEY: 'must-not-inherit' };
  const result = { commands: (prepareColocatedBeta(env)!.supervisor as any).commands };
  assert.equal(result.commands.length, 1); assert.ok(result.commands[0].args.some(a => a.endsWith('server/betaServer.ts')));
  assert.equal(result.commands[0].env.BHOOMI_DEMO_EDGE_KEY, edge); assert.equal(result.commands[0].env.RUNPOD_API_KEY, undefined);
  assert.equal(result.commands[0].env.RELAY_UPSTREAM_KEY, undefined);
  assert.throws(() => prepareColocatedBeta({ ...env, BETA_CLOUD_APPROVED: '1' }), /research inference/);
});

test('overall deadline aborts the model request and latches demo off', async t => {
  const { store, sql } = demoTestStore(); const env = enabledEnv(); let started!: () => void;
  const ready = new Promise<void>(r => { started = r; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const demo = new ShowcaseDemo(store, { env, fetchImpl: (async (_u: any, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new Error('deadline')), { once: true }); started();
    })) as typeof fetch });
    const pending = demo.answer('a', 'hello'); const rejected = assert.rejects(pending, /deadline/); await ready;
    t.mock.timers.tick(90_000); await rejected;
    assert.equal((await demo.status()).enabled, false);
  } finally { t.mock.timers.reset(); sql.close(); }
});
