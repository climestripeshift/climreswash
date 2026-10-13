import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync, createSign, type KeyObject } from 'node:crypto';
import express from 'express';
import { AccessError, cachedJwks, verifyAccessJwt, type Jwk } from '../server/beta/accessJwt';
import { DEFAULT_LIMITS, LimitError, Limiter, MemoryUsageStore, utcDay, type LimitConfig } from '../server/beta/limits';
import { BetaStore } from '../server/beta/store';
import { createBetaRouter, parseBetaChat, parseBetaFeedback, sanitizeEvidence, type BetaConfig } from '../server/beta/gateway';
import { CONSENT_VERSION } from '../shared/betaFeedback';

// ---- helpers ---------------------------------------------------------------------------------------------------------
const TEAM = 'team.cloudflareaccess.com', AUD = 'aud-tag-123';
const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(kp.publicKey.export({ format: 'jwk' }) as object), kid: 'k1', alg: 'RS256', use: 'sig' } as unknown as Jwk;
const b64 = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function token(claims: Record<string, unknown> = {}, opts: { key?: KeyObject; kid?: string; alg?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' });
  const body = b64({ iss: `https://${TEAM}`, aud: [AUD], email: 'Alice@Example.org', sub: 's1', iat: now, nbf: now - 5, exp: now + 600, ...claims });
  const s = createSign('RSA-SHA256').update(`${head}.${body}`).sign(opts.key ?? kp.privateKey).toString('base64url');
  return `${head}.${body}.${s}`;
}
const keys = async () => ({ keys: [jwk] });
const cfg = { teamDomain: TEAM, aud: AUD };

// ---- Access JWT --------------------------------------------------------------------------------------------------------
test('access jwt: a valid token yields the lower-cased e-mail', async () => {
  const id = await verifyAccessJwt(token(), cfg, keys);
  assert.equal(id.email, 'alice@example.org');
});

test('access jwt: forged, expired, wrong audience/issuer, wrong alg, unknown kid and garbage are all rejected', async () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = Math.floor(Date.now() / 1000);
  const cases: [string, string | undefined][] = [
    ['bad signature (other key)', token({}, { key: other.privateKey })],
    ['expired', token({ exp: now - 3600 })],
    ['wrong audience', token({ aud: ['someone-else'] })],
    ['wrong issuer', token({ iss: 'https://evil.cloudflareaccess.com' })],
    ['not yet valid', token({ nbf: now + 3600 })],
    ['no email', token({ email: undefined })],
    ['alg none', token({}, { alg: 'none' })],
    ['alg HS256', token({}, { alg: 'HS256' })],
    ['unknown kid', token({}, { kid: 'zzz' })],
    ['garbage', 'a.b.c'], ['empty', ''], ['undefined', undefined],
  ];
  for (const [name, t] of cases) await assert.rejects(verifyAccessJwt(t, cfg, keys), AccessError, name);
  const parts = token().split('.');
  const tampered = `${parts[0]}.${b64({ iss: `https://${TEAM}`, aud: [AUD], email: 'admin@example.org', exp: now + 600 })}.${parts[2]}`;
  await assert.rejects(verifyAccessJwt(tampered, cfg, keys), AccessError, 'tampered payload');
});

test('access jwt: keys are cached and refetched at most once per minute for an unknown kid', async () => {
  let n = 0, t = 0;
  const get = cachedJwks(async () => { n++; return { keys: [jwk] }; }, 3_600_000, 60_000, () => t);
  await get(); await get(); await get();
  assert.equal(n, 1);
});

// ---- limits ------------------------------------------------------------------------------------------------------------
function limiter(over: Partial<LimitConfig> = {}, t0 = Date.UTC(2026, 9, 12, 10)) {
  let t = t0;
  const l = new Limiter({ ...DEFAULT_LIMITS, ...over }, new MemoryUsageStore(), () => t);
  return { l, tick: (ms: number) => { t += ms; } };
}
const codeOf = (fn: () => unknown) => { try { fn(); return 'ok'; } catch (e) { return e instanceof LimitError ? e.code : 'other'; } };

test('limits: one request in flight per user, global concurrency, release is idempotent', () => {
  const { l } = limiter({ globalConcurrent: 2 });
  const a = l.acquire('u1');
  assert.equal(codeOf(() => l.acquire('u1')), 'user_busy');
  const b = l.acquire('u2');
  assert.equal(codeOf(() => l.acquire('u3')), 'capacity');
  a.release(2); a.release(2); b.release(1);
  assert.equal(codeOf(() => l.acquire('u3')), 'ok');
});

test('limits: per-minute, per-hour and per-day quotas, and the daily window rolls over at UTC midnight', () => {
  const { l, tick } = limiter({ perMinute: 2, perHour: 3, perDay: 5, perUserConcurrent: 5, globalConcurrent: 9 });
  l.acquire('u').release(1); l.acquire('u').release(1);
  assert.equal(codeOf(() => l.acquire('u')), 'per_minute');
  tick(61_000); l.acquire('u').release(1);
  assert.equal(codeOf(() => l.acquire('u')), 'per_hour');
  tick(3_600_000 + 1); l.acquire('u').release(1); tick(61_000); l.acquire('u').release(1);
  assert.equal(codeOf(() => l.acquire('u')), 'per_day');
  tick(24 * 3_600_000);
  assert.equal(codeOf(() => l.acquire('u')), 'ok');
});

test('limits: spending safeguards - global daily cap, estimated GPU-second budget and the kill switch', () => {
  const g = limiter({ globalPerDay: 2, perUserConcurrent: 5, globalConcurrent: 9, perMinute: 99 });
  g.l.acquire('a').release(1); g.l.acquire('b').release(1);
  assert.equal(codeOf(() => g.l.acquire('c')), 'global_day');
  const b = limiter({ dailyGpuSecondsBudget: 10, perMinute: 99, perUserConcurrent: 5, globalConcurrent: 9 });
  b.l.acquire('a').release(11);
  assert.equal(codeOf(() => b.l.acquire('b')), 'gpu_budget');
  const k = limiter();
  k.l.killed = true;
  assert.equal(codeOf(() => k.l.acquire('a')), 'kill_switch');
  assert.match(utcDay(Date.UTC(2026, 9, 12, 23, 59)), /^2026-10-12$/);
});

// ---- store -------------------------------------------------------------------------------------------------------------
const KEY = 'k'.repeat(40);
function mkStore() {
  const s = new BetaStore(':memory:', KEY);
  s.invite('alice@example.org', 'user', 'admin@example.org');
  s.invite('admin@example.org', 'admin', 'bootstrap');
  s.invite('bob@example.org', 'user', 'admin@example.org');
  return s;
}
const interaction = (s: BetaStore, email: string, id = 'a'.repeat(32), extra: object = {}) =>
  s.logInteraction({ id, userHash: s.hash(email), question: 'What is the hazard of Kota?', answer: 'Kota 4.03', status: 'verified', verified: true,
    verification: { passed: true }, toolCalls: [], model: { name: 'm' }, latencyS: 3, unavailable: [], sessionId: 'b'.repeat(24), ...extra });

test('store: feedback must belong to the user, categories are validated, exports need research consent and omit e-mails', () => {
  const s = mkStore();
  interaction(s, 'alice@example.org');
  assert.throws(() => s.addFeedback({ interactionId: 'a'.repeat(32), userHash: s.hash('bob@example.org'), rating: 'up', categories: [] }), /unknown interaction/);
  assert.throws(() => s.addFeedback({ interactionId: 'a'.repeat(32), userHash: s.hash('alice@example.org'), categories: ['bogus'] }), /category/);
  assert.throws(() => s.addFeedback({ interactionId: 'a'.repeat(32), userHash: s.hash('alice@example.org'), categories: [] }), /empty/);
  s.addFeedback({ interactionId: 'a'.repeat(32), userHash: s.hash('alice@example.org'), rating: 'down', categories: ['incorrect_figure', 'wrong_geography'],
    comment: '=HYPERLINK("x")', correction: 'Kota is 4.1' });
  assert.equal(s.exportRows().length, 0);                          // no research consent yet
  s.recordConsent('alice@example.org', CONSENT_VERSION, true, false);
  const rows = s.exportRows();
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes('alice@example.org'));
  assert.equal(rows[0].training_use_authorized, false);
  assert.equal(rows[0].training_review_candidate, false);
});

test('store: a thumbs click and the detailed form merge into one record per interaction and re-open a reviewed one', () => {
  const s = mkStore();
  interaction(s, 'alice@example.org');
  const u = s.hash('alice@example.org'), id = 'a'.repeat(32);
  s.recordConsent('alice@example.org', CONSENT_VERSION, true, false);
  const first = s.addFeedback({ interactionId: id, userHash: u, rating: 'down', categories: [] });
  s.review(first, 'triaged', 'admin@example.org', 'seen');
  const second = s.addFeedback({ interactionId: id, userHash: u, categories: ['incorrect_figure'], comment: 'wrong value' });
  assert.equal(second, first);
  const rows = s.listFeedback();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rating, 'down');                              // the earlier thumbs is kept
  assert.deepEqual(rows[0].categories, ['incorrect_figure']);
  assert.equal(rows[0].review_status, 'new');                        // new content re-opens the record
  s.review(first, 'triaged', 'admin@example.org', '');
  s.addFeedback({ interactionId: id, userHash: u, rating: 'down', categories: [] });   // identical: nothing changes
  assert.equal(s.listFeedback()[0].review_status, 'triaged');
});

test('store: training candidate needs review status AND training consent AND no unavailable-data flags; still never authorised', () => {
  const s = mkStore();
  interaction(s, 'alice@example.org');
  const id = s.addFeedback({ interactionId: 'a'.repeat(32), userHash: s.hash('alice@example.org'), rating: 'down', categories: ['incorrect_figure'] });
  s.recordConsent('alice@example.org', CONSENT_VERSION, true, true);
  s.review(id, 'candidate_for_training_review', 'admin@example.org', 'looks fine');
  const r = s.exportRows()[0];
  assert.equal(r.training_review_candidate, true);
  assert.equal(r.training_use_authorized, false);
  assert.throws(() => s.review(id, 'approved_for_training' as never, 'admin@example.org', ''), /invalid review status/);
});

// ---- gateway over HTTP -----------------------------------------------------------------------------------------------
function coreReply(over: object = {}) {
  return { interaction_id: 'c'.repeat(32), session_id: 'd'.repeat(24), status: 'verified', answer: 'Kota, Rajasthan: 4.03 [F1].',
    evidence: '**wash_context**\n- source: client/public/data/india_hex_props.json · sha256 b9351fe19210\n- see /Users/x/secret/file.csv',
    links: ['/grid?state=Rajasthan'], latency_s: 3, verification: { passed: true, violations: [] }, secret: 'no',
    tool_trace: [{ step: 0, latency_s: 1, calls: [{ name: 'district_hazard_profile', arguments: { district: 'Kota' }, status: 'ok' },
      { name: 'monsoon_indicators', arguments: { district: 'Kota' }, status: 'unsupported' }] }],
    model: { name: 'bhoomi-llm-v1-ckpt160', label: 'internal' }, ...over };
}
async function gateway(opts: { cores?: string[]; upstream?: (url: string, init: any) => Promise<Response>; hosted?: boolean; limits?: Partial<LimitConfig>; authMode?: 'cloudflare' | 'dev' } = {}) {
  const store = mkStore();
  const calls: { url: string; body: any }[] = [];
  const fetchImpl = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    return opts.upstream ? opts.upstream(String(url), init) : new Response(JSON.stringify(coreReply()), { status: 200 });
  }) as typeof fetch;
  const config: BetaConfig = {
    hosted: opts.hosted ?? true, authMode: (opts.authMode ?? 'cloudflare') as "cloudflare", inferenceReady: true, access: cfg, getJwks: keys, devEmail: 'alice@example.org',
    coreUrl: 'http://127.0.0.1:8765', ...(opts.cores ? { coreUrls: opts.cores } : {}), publicOrigin: 'https://beta.example.org', limits: { ...DEFAULT_LIMITS, requestTimeoutMs: 200, perMinute: 50, ...opts.limits },
    model: { label: 'Bhoomi-LLM v1 (experimental research beta)', experimental: true, baseModel: 'b', note: 'n' },
  };
  const limiter = new Limiter(config.limits, store);
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use(createBetaRouter({ store, limiter, config, fetchImpl }));
  const srv = http.createServer(app);
  await new Promise<void>(ok => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const req = (path: string, init: { method?: string; email?: string | null; body?: unknown; headers?: Record<string, string> } = {}) =>
    fetch(base + path, { method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: { ...(init.body !== undefined ? { 'Content-Type': 'application/json', Origin: 'https://beta.example.org' } : {}),
        ...(init.email !== null ? { 'Cf-Access-Jwt-Assertion': token({ email: init.email ?? 'alice@example.org' }) } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  const consent = async (email = 'alice@example.org', training = false) => (await req('/bhoomiai/api/consent', { email, body: { version: CONSENT_VERSION, research: true, training } })).status;
  return { store, calls, req, consent, limiter, close: () => srv.close() };
}

test('gateway: unauthenticated, forged, uninvited and suspended users are refused; health reveals nothing', async () => {
  const g = await gateway();
  assert.equal((await g.req('/bhoomiai/api/health', { email: null })).status, 401);
  assert.equal((await g.req('/bhoomiai/api/me', { email: null })).status, 401);
  assert.equal((await g.req('/bhoomiai/api/me', { headers: { 'Cf-Access-Jwt-Assertion': 'a.b.c' }, email: null })).status, 401);
  assert.equal((await g.req('/bhoomiai/api/me', { email: 'stranger@example.org' })).status, 403);
  assert.equal((await g.req('/bhoomiai/api/me')).status, 200);
  g.store.setStatus('alice@example.org', 'suspended', 'admin@example.org');
  assert.equal((await g.req('/bhoomiai/api/me')).status, 403);
  g.close();
});

test('gateway: chat needs consent; the request sent to the Core is fixed and carries no model, tool or path input', async () => {
  const g = await gateway();
  const r0 = await g.req('/bhoomiai/api/chat', { body: { message: 'hi' } });
  assert.equal(r0.status, 428);
  assert.equal(g.calls.length, 0);
  assert.equal(await g.consent(), 200);
  const r = await g.req('/bhoomiai/api/chat', { body: { message: 'What is the hazard of Kota?' } });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(g.calls[0].body).sort(), ['deadline_ms', 'deployment', 'message', 'user_hash']);
  assert.equal(g.calls[0].body.deployment, 'cloud_beta');
  assert.match(g.calls[0].url, /^http:\/\/127\.0\.0\.1:8765\/api\/chat$/);
  const j: any = await r.json();
  assert.equal(j.secret, undefined);
  assert.deepEqual(j.links, []);
  assert.ok(!/india_hex_props|\/Users\/|client\/public|sha256/.test(j.evidence), j.evidence);
  assert.equal(j.model.experimental, true);
  assert.deepEqual(j.unavailable, ['monsoon_indicators: unsupported']);
  for (const bad of [{ message: 'hi', model: 'x' }, { message: 'hi', tools: [] }, { message: '' }, { message: 'x'.repeat(5000) }, { message: 'hi', session_id: '../etc' }])
    assert.equal((await g.req('/bhoomiai/api/chat', { body: bad })).status, 400, JSON.stringify(bad).slice(0, 40));
  g.close();
});

test('gateway: sessions cannot be shared between users; per-user concurrency and quotas return 429 with Retry-After', async () => {
  let release!: () => void;
  const gate = new Promise<void>(ok => (release = ok));
  const g = await gateway({ limits: { requestTimeoutMs: 5000 }, upstream: async () => { await gate; return new Response(JSON.stringify(coreReply()), { status: 200 }); } });
  await g.consent(); await g.consent('bob@example.org');
  const first = g.req('/bhoomiai/api/chat', { body: { message: 'q1' } });
  await new Promise(r => setTimeout(r, 50));
  const second = await g.req('/bhoomiai/api/chat', { body: { message: 'q2' } });
  assert.equal(second.status, 429);
  assert.ok(Number(second.headers.get('retry-after')) > 0);
  release();
  const a: any = await (await first).json();
  const steal = await g.req('/bhoomiai/api/chat', { email: 'bob@example.org', body: { message: 'hi', session_id: a.session_id } });
  assert.equal(steal.status, 400);
  g.close();
});

test('gateway: upstream timeout -> 504 and the slot is released; upstream errors are not leaked', async () => {
  const slow = await gateway({ upstream: (_u, init) => new Promise((_ok, bad) => init.signal.addEventListener('abort', () => bad(Object.assign(new Error('x'), { name: 'AbortError' })))) });
  await slow.consent();
  assert.equal((await slow.req('/bhoomiai/api/chat', { body: { message: 'q' } })).status, 504);
  assert.equal(slow.limiter.snapshot(slow.store.hash('alice@example.org')).used_today, 1);
  slow.close();
  const bad = await gateway({ upstream: async () => new Response(JSON.stringify({ error: 'Traceback /Users/x/core.py line 3' }), { status: 500 }) });
  await bad.consent();
  const r = await bad.req('/bhoomiai/api/chat', { body: { message: 'q' } });
  assert.equal(r.status, 502);
  assert.ok(!(await r.text()).includes('Traceback'));
  bad.close();
});

test('gateway: kill switch and daily budget stop requests before the GPU is touched', async () => {
  const g = await gateway({ limits: { dailyGpuSecondsBudget: 0.01 }, upstream: async () => { await new Promise(r => setTimeout(r, 40)); return new Response(JSON.stringify(coreReply()), { status: 200 }); } });
  await g.consent();
  assert.equal((await g.req('/bhoomiai/api/chat', { body: { message: 'q' } })).status, 200);
  const r = await g.req('/bhoomiai/api/chat', { body: { message: 'q2' } });
  assert.equal(r.status, 503);
  assert.equal(g.calls.length, 1);
  g.close();
});

test('gateway: feedback is validated, owner-bound and taxonomy-limited; admin routes require the admin role', async () => {
  const g = await gateway();
  await g.consent();
  const chat: any = await (await g.req('/bhoomiai/api/chat', { body: { message: 'q' } })).json();
  const ok = await g.req('/bhoomiai/api/feedback', { body: { interaction_id: chat.interaction_id, rating: 'down', categories: ['incorrect_figure', 'wrong_geography'],
    comment: 'Kota is 4.1', suggested_correction: 'use 4.1' } });
  assert.equal(ok.status, 200);
  for (const bad of [{ interaction_id: chat.interaction_id, categories: ['nope'] }, { interaction_id: 'zz', rating: 'up' },
    { interaction_id: chat.interaction_id, rating: 'up', extra: 1 }, { interaction_id: 'e'.repeat(32), rating: 'up' }])
    assert.equal((await g.req('/bhoomiai/api/feedback', { body: bad })).status, 400);
  assert.equal((await g.req('/bhoomiai/api/admin/feedback')).status, 403);
  assert.equal((await g.req('/bhoomiai/api/admin/export')).status, 403);
  assert.equal((await g.req('/bhoomiai/api/admin/invite', { body: { email: 'x@y.org' } })).status, 403);
  const adm: any = await (await g.req('/bhoomiai/api/admin/feedback', { email: 'admin@example.org' })).json();
  assert.equal(adm.items.length, 1);
  const rv = await g.req(`/bhoomiai/api/admin/feedback/${adm.items[0].feedback_id}/review`, { email: 'admin@example.org', body: { review_status: 'confirmed_issue', notes: 'ok' } });
  assert.equal(rv.status, 200);
  g.close();
});

test('gateway: several Core workers - new sessions go to the least busy worker and a session stays on its worker', async () => {
  let n = 0, releaseFirst: () => void = () => undefined, first = true;
  const answer = (url: string) => new Response(JSON.stringify(coreReply({ session_id: (url.includes(':8766') ? 'e' : 'd').repeat(24), interaction_id: (++n).toString(16).padStart(32, '0') })), { status: 200 });
  const g = await gateway({
    cores: ['http://127.0.0.1:8765', 'http://127.0.0.1:8766'], limits: { globalConcurrent: 2, requestTimeoutMs: 3000 },
    upstream: (url) => first ? (first = false, new Promise<Response>(ok => { releaseFirst = () => ok(answer(url)); })) : Promise.resolve(answer(url)),
  });
  await g.consent('alice@example.org'); await g.consent('bob@example.org');
  const pAlice = g.req('/bhoomiai/api/chat', { email: 'alice@example.org', body: { message: 'Kota hazard?' } });
  while (g.calls.length < 1) await new Promise(r => setTimeout(r, 5));
  const bob: any = await (await g.req('/bhoomiai/api/chat', { email: 'bob@example.org', body: { message: 'Jaipur hazard?' } })).json();
  assert.ok(g.calls[1].url.startsWith('http://127.0.0.1:8766'), 'second concurrent request goes to the idle worker');
  releaseFirst();
  const alice: any = await (await pAlice).json();
  assert.equal(alice.session_id, 'd'.repeat(24));
  assert.equal(bob.session_id, 'e'.repeat(24));
  await g.req('/bhoomiai/api/chat', { email: 'bob@example.org', body: { message: 'And Jaipur rainfall?', session_id: bob.session_id } });
  assert.ok(g.calls[2].url.startsWith('http://127.0.0.1:8766'), 'bob stays on the worker that holds his session');
  await g.req('/bhoomiai/api/chat', { email: 'alice@example.org', body: { message: 'And Kota rainfall?', session_id: alice.session_id } });
  assert.ok(g.calls[3].url.startsWith('http://127.0.0.1:8765'));
  // a session id is never usable by another user, whichever worker holds it
  assert.equal((await g.req('/bhoomiai/api/chat', { email: 'alice@example.org', body: { message: 'x', session_id: bob.session_id } })).status, 400);
  g.close();
});

test('gateway: export is consent-filtered, pseudonymous, CSV-safe and audited', async () => {
  const g = await gateway();
  await g.consent();
  const chat: any = await (await g.req('/bhoomiai/api/chat', { body: { message: '=cmd|calc' } })).json();
  await g.req('/bhoomiai/api/feedback', { body: { interaction_id: chat.interaction_id, rating: 'down', categories: ['other'], comment: '@SUM(1)' } });
  const csv = await (await g.req('/bhoomiai/api/admin/export?format=csv', { email: 'admin@example.org' })).text();
  assert.ok(!csv.includes('alice@example.org'));
  assert.ok(csv.includes(`"'=cmd|calc"`) && csv.includes(`"'@SUM(1)"`));
  const jl = await (await g.req('/bhoomiai/api/admin/export', { email: 'admin@example.org' })).text();
  assert.equal(JSON.parse(jl.split('\n')[0]).training_use_authorized, false);
  g.close();
});

test('gateway: no other routes - production endpoints, Core endpoints and debug paths are not served; dev auth is impossible when hosted', async () => {
  const g = await gateway();
  for (const p of ['/bhoomiai/api/debug', '/bhoomiai/api/admin', '/api/bhoomi-ai/chat', '/api/chat', '/api/health', '/metrics', '/.env'])
    assert.ok([401, 403, 404, 405, 428].includes((await g.req(p)).status), p);
  assert.equal((await g.req('/bhoomiai/api/chat', { body: { message: 'x' }, headers: { Origin: 'https://evil.example' } })).status, 403);
  // raw HTTP (no client-side URL normalisation): dot-segments never reach another route
  const port = Number(new URL((await g.req('/bhoomiai/api/health')).url).port);
  const raw = (path: string) => new Promise<number>((ok, bad) => {
    const rq = http.request({ host: '127.0.0.1', port, path, headers: { 'Cf-Access-Jwt-Assertion': token() } }, rs => { rs.resume(); ok(rs.statusCode ?? 0); });
    rq.on('error', bad); rq.end();
  });
  for (const p of ['/bhoomiai/api/chat/../health', '/bhoomiai/api/../index.html', '/bhoomiai/api/admin/../../etc/passwd', '/bhoomiai/api/%2e%2e/%2e%2e/etc/passwd'])
    assert.ok([403, 404].includes(await raw(p)), p);
  g.close();
  const dev = await gateway({ hosted: true, authMode: 'dev' });
  assert.equal((await dev.req('/bhoomiai/api/me', { email: null, headers: { 'x-beta-dev-user': 'alice@example.org' } })).status, 503);
  dev.close();
  const local = await gateway({ hosted: false, authMode: 'dev' });
  assert.equal((await local.req('/bhoomiai/api/me', { email: null, headers: { 'x-beta-dev-user': 'alice@example.org' } })).status, 503);
  local.close();
});

test('helpers: evidence sanitising and request parsers', () => {
  const s = sanitizeEvidence('- source: client/public/data/hex_historical_climatology.json · sha256 abcdef0123456789\n- note ../../data/feedback.sqlite and 0123456789abcdef0123456789abcdef0123456789');
  assert.ok(s.includes('ERA5 climatology'));
  assert.ok(!/feedback\.sqlite|client\/public|abcdef01/.test(s));
  assert.equal(parseBetaChat({ message: 'hi' }, 100).ok, true);
  assert.equal(parseBetaFeedback({ interaction_id: 'a'.repeat(32), rating: 'up' }).ok, true);
});


test('authorization: history, streaming, tools and unknown beta routes require verified identity', async () => {
  const g = await gateway();
  for (const path of ['/history', '/chat/stream', '/tools', '/admin/users', '/debug', '/logout']) {
    assert.equal((await g.req('/bhoomiai/api' + path, { email: null })).status, 401);
    assert.equal((await g.req('/bhoomiai/api' + path, { email: 'stranger@example.org' })).status, 403);
  }
  await g.consent();
  await g.consent('bob@example.org');
  await g.req('/bhoomiai/api/chat', { body: { message: 'Private Alice question' } });
  const a = await (await g.req('/bhoomiai/api/history')).json();
  const b = await (await g.req('/bhoomiai/api/history', { email: 'bob@example.org' })).json();
  assert.equal(a.items.length, 1); assert.equal(b.items.length, 0);
  assert.equal((await g.req('/bhoomiai/api/tools')).status, 404);
  assert.equal((await g.req('/bhoomiai/api/chat/stream')).status, 404);
  g.close();
});

test('admin: quota and role changes, last-admin protection, immediate revocation and old-token denial after restore', async () => {
  const g = await gateway(); await g.consent();
  assert.equal((await g.req('/bhoomiai/api/admin/user', { body: { email: 'bob@example.org', role: 'admin' } })).status, 403);
  assert.equal((await g.req('/bhoomiai/api/admin/user', { email: 'admin@example.org', body: { email: 'admin@example.org', role: 'user' } })).status, 400);
  assert.equal((await g.req('/bhoomiai/api/admin/user', { email: 'admin@example.org', body: { email: 'alice@example.org', quota: 0 } })).status, 200);
  assert.equal((await g.req('/bhoomiai/api/chat', { body: { message: 'q' } })).status, 429);
  assert.equal((await g.req('/bhoomiai/api/me')).status, 200);
  assert.equal((await g.req('/bhoomiai/api/admin/suspend', { email: 'admin@example.org', body: { email: 'alice@example.org' } })).status, 200);
  assert.equal((await g.req('/bhoomiai/api/me')).status, 403);
  await g.req('/bhoomiai/api/admin/suspend', { email: 'admin@example.org', body: { email: 'alice@example.org', suspended: false } });
  assert.equal((await g.req('/bhoomiai/api/me')).status, 403);
  g.close();
});

test('logout: signed cookie authentication works; logged-out token cannot be replayed', async () => {
  const g = await gateway(); const jwt = token();
  assert.equal((await g.req('/bhoomiai/api/me', { email: null, headers: { Cookie: `CF_Authorization=${jwt}` } })).status, 200);
  assert.equal((await g.req('/bhoomiai/api/logout', { body: {}, headers: { 'Cf-Access-Jwt-Assertion': jwt } })).status, 200);
  assert.equal((await g.req('/bhoomiai/api/me', { headers: { 'Cf-Access-Jwt-Assertion': jwt } })).status, 401);
  g.close();
});

test('CSRF: missing/foreign origins and malformed filters fail before mutations', async () => {
  const g = await gateway();
  assert.equal((await g.req('/bhoomiai/api/consent', { body: { version: CONSENT_VERSION, research: true, training: false }, headers: { Origin: '' } })).status, 403);
  assert.equal((await g.req('/bhoomiai/api/admin/feedback?limit=NaN', { email: 'admin@example.org' })).status, 400);
  assert.equal((await g.req('/bhoomiai/api/admin/feedback?offset=-1', { email: 'admin@example.org' })).status, 400);
  g.close();
});

test('public DTO and history: internal paths, endpoint URLs, error traces and secrets never escape', async () => {
  const g = await gateway({ upstream: async () => new Response(JSON.stringify(coreReply({
    answer: 'See /app/private/output.json at http://127.0.0.1:8081/v1 and hf_abcdefghijklmnopqrstuv',
    notes: ['/etc/passwd'], facts: [{ path: '/Users/me/private.json' }], memory: { key: 'private' },
    tool_trace: [{ step: 0, calls: [{ name: 'wash_context', status: 'ok', arguments: {}, errors: ['Traceback /home/me/core.py'] }] }]
  }))) });
  await g.consent();
  const text = await (await g.req('/bhoomiai/api/chat', { body: { message: 'q' } })).text();
  assert.ok(!/private|Traceback|hf_abcdefghijkl|127.0.0.1|passwd/.test(text), text);
  const hist = await (await g.req('/bhoomiai/api/history')).text();
  assert.ok(!/private|hf_abcdefghijkl|127.0.0.1/.test(hist), hist);
  g.close();
});

test('durable pause, admission reservations and consent snapshots survive reopen', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(tmpdir() + '/bhoomi-state-');
  let s = new BetaStore(dir + '/beta.sqlite', KEY);
  try {
    s.invite('a@example.org', 'user', 'owner');
    s.recordConsent('a@example.org', CONSENT_VERSION, true, false);
    const l = new Limiter({ ...DEFAULT_LIMITS, reservationSeconds: 100, monthlyGpuSecondsBudget: 150 }, s);
    const slot = l.acquire(s.hash('a@example.org')); // quota consumed before completion/crash
    assert.equal(s.userDay(s.hash('a@example.org'), utcDay(Date.now())).requests, 1);
    slot.release(1);
    assert.equal(codeOf(() => l.acquire(s.hash('a@example.org'))), 'gpu_budget');
    l.killed = true; s.close(); s = new BetaStore(dir + '/beta.sqlite', KEY);
    assert.equal(new Limiter(DEFAULT_LIMITS, s).killed, true);
  } finally { s.close(); rmSync(dir, { recursive: true }); }
});

test('50 invited identities: burst is bounded and histories stay separate', async () => {
  let n = 0,active=0,peak=0;
  const g = await gateway({ limits: { globalConcurrent: 2 }, upstream: async () => {
    active++;peak=Math.max(peak,active);
    try{
      await new Promise(r => setTimeout(r, 20));
      return new Response(JSON.stringify(coreReply({ interaction_id: (++n).toString(16).padStart(32, '0'), session_id: n.toString(16).padStart(24, '0') })));
    }finally{active--;}
  } });
  const emails = Array.from({ length: 50 }, (_, i) => `invite${i}@example.org`);
  for (const email of emails) { g.store.invite(email, 'user', 'admin'); await g.consent(email); }
  const responses = await Promise.all(emails.map(email => g.req('/bhoomiai/api/chat', { email, body: { message: email } })));
  assert.ok(responses.every(r => r.status === 200 || r.status === 429));
  assert.ok(peak > 0 && peak <= 2);
  for (let i = 0; i < emails.length; i++) {
    const history = await (await g.req('/bhoomiai/api/history', { email: emails[i] })).json();
    assert.ok(history.items.every((item: any) => item.question === emails[i]));
  }
  g.close();
});

test('JWKS rotation: an unknown key triggers bounded refresh and expired tokens fail at exact boundary', async () => {
  let now = 0, fetches = 0;
  const rotated = { ...jwk, kid: 'rotated' };
  const get = cachedJwks(async () => ({ keys: ++fetches === 1 ? [jwk] : [jwk, rotated] }), 3600000, 60000, () => now);
  await verifyAccessJwt(token(), cfg, get);
  now = 60001;
  await verifyAccessJwt(token({}, { kid: 'rotated' }), cfg, get);
  assert.equal(fetches, 2);
  await assert.rejects(verifyAccessJwt(token({}, { kid: 'missing' }), cfg, get), AccessError);
  assert.equal(fetches, 2);
  const t = Math.floor(Date.now() / 1000);
  await assert.rejects(verifyAccessJwt(token({ exp: t, iat: t - 1 }), { ...cfg, clockSkewSec: 0 }, keys, t), AccessError);
  await assert.rejects(verifyAccessJwt(token({ iat: t + 1000, exp: t + 500 }), cfg, keys, t), AccessError);
});

test('Worker backend: even a valid invited identity cannot bypass the origin secret', async () => {
  const store = mkStore();
  const config: BetaConfig = { hosted: true, authMode: 'cloudflare', access: cfg, getJwks: keys, originKey: 'secret'.repeat(8),
    limits: DEFAULT_LIMITS, publicOrigin: 'https://climreswash.in', model: { label: 'beta', baseModel: 'b', note: 'n', experimental: true } };
  const app = express(); app.use(createBetaRouter({ store, config, limiter: new Limiter(DEFAULT_LIMITS, store) }));
  const server = http.createServer(app); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/bhoomiai/api/me`;
    assert.equal((await fetch(url, { headers: { 'Cf-Access-Jwt-Assertion': token() } })).status, 403);
    assert.equal((await fetch(url, { headers: { 'Cf-Access-Jwt-Assertion': 'forged', 'x-bhoomi-origin-key': config.originKey! } })).status, 401);
    assert.equal((await fetch(url, { headers: { 'Cf-Access-Jwt-Assertion': token(), 'x-bhoomi-origin-key': config.originKey! } })).status, 200);
  } finally { server.closeAllConnections(); server.close(); store.close(); }
});
