// HTTP integration with the actual proxy, gateway and PIN/admin authentication.
// SQL and model transport are local test fixtures; no real secrets, provider or GPU is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { randomInt, randomBytes } from 'node:crypto';
import { demoTestStore } from './fixtures/demoStore';
import { ShowcaseDemo, DEMO_MODEL } from '../server/beta/demo';
import { PinAuth, configureSharedPin } from '../server/beta/pinAuth';
import { CodeAuth } from '../server/beta/codeAuth';
import { hashAccessCode } from '../server/beta/accessCodes';
import { createBetaRouter, type BetaConfig } from '../server/beta/gateway';
import { DEFAULT_LIMITS, Limiter, MemoryUsageStore } from '../server/beta/limits';
import { registerBetaProxy } from '../server/betaProxy';
import type { Conversations } from '../server/beta/conversations';
const origin = 'https://climreswash.in';
const okey = 'synthetic-test-ingress-'.repeat(3);
async function listen(app: express.Express) {
  const server = http.createServer(app); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  return { server, base: 'http://127.0.0.1:' + (server.address() as any).port };
}
async function close(server: http.Server) { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
const cookies = (r: Response) => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');

test('production proxy → PIN/admin sessions → isolated demo works without any research approval; gateway loss fails closed', async () => {
  const { store, sql } = demoTestStore(); let modelRequests = 0;
  const edge = randomBytes(32).toString('base64url');
  const demo = new ShowcaseDemo(store, { env: { BHOOMI_DEMO_ENABLED: '1', BHOOMI_DEMO_EDGE_KEY: edge,
    BHOOMI_DEMO_ENDPOINT: 'https://testonly-8000.proxy.runpod.net/v1/chat/completions', BHOOMI_DEMO_UNTIL: new Date(Date.now() + 20 * 60_000).toISOString() },
    fetchImpl: (async (_url: unknown, init: RequestInit) => {
      modelRequests++; assert.equal((init.headers as any).Authorization, 'Bearer ' + edge);
      const body = JSON.parse(init.body as string); assert.equal(body.model, DEMO_MODEL);
      return Response.json({ model: DEMO_MODEL, choices: [{ message: body.tool_choice === 'auto'
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'fixture-call', type: 'function', function: { name: 'district_hazard_profile', arguments: JSON.stringify({ district: 'SYNTHETIC District Alpha', state: 'SYNTHETIC State' }) } }] }
        : { role: 'assistant', content: 'Never display this generated claim 9999 or this credential ' + edge } }] });
    }) as typeof fetch });
  const config: BetaConfig = { hosted: true, authMode: 'code', originKey: okey, publicOrigin: origin,
    codeAuth: new CodeAuth(store, origin, 60, Date.now, new PinAuth(store, origin, 60)), conversations: {} as Conversations,
    inferenceReady: false, demo, limits: DEFAULT_LIMITS, model: { label: 'unapproved research model', experimental: true, baseModel: 'test', note: 'test' } };
  const gatewayApp = express(); gatewayApp.use(express.json({ limit: '16kb' })); gatewayApp.use(createBetaRouter({ store, config, limiter: new Limiter(DEFAULT_LIMITS, new MemoryUsageStore()) }));
  const gateway = await listen(gatewayApp);
  const publicApp = express(); registerBetaProxy(publicApp, gateway.base, fetch, { authMode: 'code', originKey: okey, publicOrigin: origin });
  publicApp.get('/', (_req, res) => res.send('public site')); const publicServer = await listen(publicApp);
  // Node's fetch manages Host itself; raw HTTP preserves the custom-domain Host used by the production proxy.
  const request = (route: string, body?: object, cookie = '', extra = {}) => new Promise<Response>((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const outgoing = http.request(publicServer.base + '/bhoomiai/api' + route, {
      method: body ? 'POST' : 'GET', headers: { Host: 'climreswash.in', Origin: origin, Cookie: cookie,
        'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...extra },
    }, incoming => {
      const chunks: Buffer[] = []; incoming.on('data', c => chunks.push(c)); incoming.on('error', reject);
      incoming.on('end', () => {
        const headers = new Headers(); for (let i = 0; i < incoming.rawHeaders.length; i += 2) headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
        resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers }));
      });
    }); outgoing.on('error', reject); outgoing.end(data);
  });
  let gatewayClosed = false;
  try {
    const pin = String(randomInt(1_000_000)).padStart(6, '0'); await configureSharedPin(store, pin, 'fixture');
    assert.equal((await request('/demo/chat', { message: 'hello' })).status, 401);
    assert.equal((await request('/demo/chat', { message: 'hello' }, 'BhoomiSession=' + randomBytes(32).toString('base64url'))).status, 401);
    assert.equal(modelRequests, 0);
    const login = await request('/auth/login', { pin }); assert.equal(login.status, 200); const cookie = cookies(login);
    assert.ok(cookie.includes('BhoomiSession=')); assert.match(login.headers.getSetCookie()[0], /HttpOnly.*Secure|Secure.*HttpOnly/);
    const me = await (await request('/me', undefined, cookie)).json(); assert.equal(me.demo.enabled, true); assert.equal(me.consent.research, false);
    assert.equal((await request('/demo/chat', { message: 'hello' }, cookie, { Origin: 'https://foreign.example' })).status, 403);
    assert.equal((await request('/demo/chat', { message: 'hello', model: 'other' }, cookie)).status, 400);
    const answered = await request('/demo/chat', { message: 'Show the synthetic screening index' }, cookie); const answer = await answered.json();
    assert.equal(answered.status, 200, JSON.stringify(answer)); assert.match(answer.answer, /DEMONSTRATION DATA/); assert.match(answer.answer, /2\.5/);
    assert.equal(answer.status, 'demonstration'); assert.ok(!JSON.stringify(answer).includes(edge)); assert.ok(!answer.answer.includes('9999'));
    assert.equal(modelRequests, 2); assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM interactions').get()!.n, 0);
    assert.equal((await request('/demo/off', {}, cookie)).status, 403);
    assert.equal((await request('/consent', { version: me.consent.required_version, research: true, training: false }, cookie)).status, 200);
    const research = await request('/chat', { message: 'research' }, cookie); assert.equal(research.status, 503);
    assert.match((await research.json()).message, /approval/); assert.equal(modelRequests, 2);
    const adminCode = randomBytes(32).toString('base64url');
    await store.invite('admin@example.invalid', 'admin', 'fixture'); await store.setAccessCodeHash('admin@example.invalid', await hashAccessCode(adminCode), 'fixture');
    const adminLogin = await request('/auth/admin/login', { email: 'admin@example.invalid', access_code: adminCode }); assert.equal(adminLogin.status, 200);
    const adminCookie = cookies(adminLogin);
    assert.equal((await request('/demo/chat', { message: 'synthetic index' }, adminCookie)).status, 200); assert.equal(modelRequests, 4);
    assert.equal((await request('/demo/off', {}, adminCookie)).status, 200);
    assert.equal((await request('/demo/chat', { message: 'hello' }, cookie)).status, 503); assert.equal(modelRequests, 4);
    await close(gateway.server); gatewayClosed = true;
    for (const route of ['/auth/login', '/demo/chat']) assert.equal((await request(route, route === '/auth/login' ? { pin } : { message: 'hello' }, cookie)).status, 503);
    assert.equal((await request('/me', undefined, adminCookie)).status, 503); assert.equal(modelRequests, 4);
    assert.equal(await (await fetch(publicServer.base + '/')).text(), 'public site');
  } finally { await close(publicServer.server); if (!gatewayClosed) await close(gateway.server); sql.close(); }
});
