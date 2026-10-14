// Showcase only. Does not import Core, scientific datasets, approval manifests or production inference.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Router } from 'express';
import type { PostgresBetaStore } from './pgStore';
import { parseBetaChat } from './gateway';

export const DEMO_BUNDLE_SHA256 = '3e5ea5c9f67c82fb24e2578793dd87c073104242512bb3d7364f9410b7c274a5';
export const DEMO_MODEL = 'bhoomi-llm-v1-ckpt160';
const LABEL = 'DEMONSTRATION DATA — invented synthetic values; not real observations or validated predictions.';
const LIMITS = { concurrent: 1, minute: 6, total: 30, timeoutMs: 90_000 };
const STATE = 'showcase_demo_control';
const BUNDLE = 'deploy/beta/owner-launch';
const DATA = 'research/bhoomi_ai_core_v0/data/owner-synthetic/SYNTHETIC_hex_props.json';
const digest = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export function loadDemoData(root = process.cwd()) {
  const base = path.join(root, BUNDLE);
  if (digest(fs.readFileSync(path.join(base, 'bhoomi-owner-SYNTHETIC.tar.gz'))) !== DEMO_BUNDLE_SHA256) throw new Error('Demo archive mismatch');
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'synthetic-bundle/MANIFEST.json'), 'utf8'));
  if (manifest.bundle_sha256 !== '8c9808247db094630e29d193a3712243ada069fbda0fd688b511df2a76438f53' || !manifest.synthetic_only) throw new Error('Demo manifest mismatch');
  const mapping = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  if (digest(JSON.stringify(mapping)) !== manifest.bundle_sha256) throw new Error('Demo digest mismatch');
  for (const [file, hash] of Object.entries(mapping)) {
    if (file.includes('..') || path.isAbsolute(file) || digest(fs.readFileSync(path.join(base, 'synthetic-bundle', file))) !== hash) throw new Error('Demo file mismatch');
  }
  const rows = JSON.parse(fs.readFileSync(path.join(base, 'synthetic-bundle', DATA), 'utf8'));
  if (rows.length !== 1 || rows[0].synthetic !== true) throw new Error('Synthetic fixture required');
  return rows[0] as { state: string; district_name: string; population: number; hex_risk: number; flood_risk: number; heat_risk: number };
}

export function demoEndpoint(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || !/^[a-z0-9]+-8000\.proxy\.runpod\.net$/.test(u.hostname)
    || u.port || u.username || u.password || u.pathname !== '/v1/chat/completions' || u.search || u.hash) throw new Error('Authenticated Runpod Pod gate required');
  return u;
}
const tools = [
  { name: 'district_hazard_profile', description: 'Read invented hazard screening values ONLY for SYNTHETIC District Alpha in SYNTHETIC State. All real districts are unavailable.',
    parameters: { type: 'object', properties: { district: { type: 'string' }, state: { type: 'string' } }, required: ['district', 'state'], additionalProperties: false } },
  { name: 'method_notes', description: 'Explain invented screening indices and showcase limitations.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'describe_capabilities', description: 'Describe synthetic-only showcase scope. No forecasts or real data.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
].map(f => ({ type: 'function', function: f }));
const SYSTEM = `You are Bhoomi AI, a synthetic-only showcase of the fine-tuned Bhoomi-LLM v1. ${LABEL}
Only SYNTHETIC District Alpha in SYNTHETIC State is authorized. Always call an appropriate tool, including for greetings or scope questions. Call district_hazard_profile for hazard questions; method_notes for limitations; describe_capabilities for other questions. Never invent numbers, access real data, forecast or recommend operational decisions. After tool results, give a short explanation. The backend presents only deterministic tool-backed results and approved explanations; model prose is not displayed. Do not request another tool after results.`;

type Control = { activation: string; off: boolean; total: number; hits: number[]; lease?: { id: string; until: number } };
type Message = { role: string; [key: string]: unknown };
export interface DemoOptions { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: () => number; root?: string }
export class ShowcaseDemo {
  private env: NodeJS.ProcessEnv;
  private fetcher: typeof fetch;
  private now: () => number;
  private sessions = new Map<string, { owner: string; expires: number; turns: Message[][] }>();
  private controllers = new Set<AbortController>();
  private data: ReturnType<typeof loadDemoData> | undefined;
  constructor(private store: PostgresBetaStore, private options: DemoOptions = {}) {
    this.env = options.env ?? process.env; this.fetcher = options.fetchImpl ?? fetch; this.now = options.now ?? Date.now;
    // OFF configuration does not need an upstream or a secret, and performs no network activity.
    if (this.configured()) { demoEndpoint(this.env.BHOOMI_DEMO_ENDPOINT!); this.data = loadDemoData(options.root); }
  }
  private configured() {
    const expiry = Date.parse(this.env.BHOOMI_DEMO_UNTIL ?? '');
    return this.env.BHOOMI_DEMO_ENABLED === '1' && !!this.env.BHOOMI_DEMO_ENDPOINT
      && /^[A-Za-z0-9_-]{32,}$/.test(this.env.BHOOMI_DEMO_EDGE_KEY ?? '')
      && Number.isFinite(expiry) && expiry > this.now() && expiry - this.now() <= 30 * 60_000;
  }
  private async state(): Promise<Control> {
    const raw = await this.store.setting(STATE);
    const activation = this.env.BHOOMI_DEMO_UNTIL ?? '';
    return raw ? JSON.parse(raw) : { activation, off: false, total: 0, hits: [] };
  }
  async status() {
    const s = await this.state();
    return { configured: this.env.BHOOMI_DEMO_ENABLED === '1', enabled: this.configured() && !s.off && (!s.activation || s.activation === this.env.BHOOMI_DEMO_UNTIL), label: LABEL, limits: LIMITS };
  }
  async off() {
    for (const ctl of Array.from(this.controllers)) ctl.abort();
    await this.store.db.transaction(async () => { const s = await this.state(); s.off = true; await this.store.setSetting(STATE, JSON.stringify(s)); });
  }
  private async acquire() {
    const result = await this.store.db.transaction(async () => {
      const s = await this.state(), now = this.now();
      if (!this.configured() || s.off || (s.activation && s.activation !== this.env.BHOOMI_DEMO_UNTIL)) throw new Error('off');
      // An expired lease means uncertain model work after a crash: fail closed rather than overlapping requests.
      if (s.lease) { if (s.lease.until <= now) { s.off = true; await this.store.setSetting(STATE, JSON.stringify(s)); } return null; }
      s.hits = s.hits.filter(t => now - t < 60_000);
      if (s.total >= LIMITS.total || s.hits.length >= LIMITS.minute) throw new Error('limit');
      const id = randomBytes(16).toString('hex'); s.total++; s.hits.push(now); s.lease = { id, until: now + 180_000 };
      await this.store.setSetting(STATE, JSON.stringify(s)); return id;
    });
    if (!result) throw new Error('busy');
    return result;
  }
  private async release(id: string) {
    await this.store.db.transaction(async () => { const s = await this.state(); if (s.lease?.id === id) delete s.lease; await this.store.setSetting(STATE, JSON.stringify(s)); });
  }
  private execute(name: string, args: unknown) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('invalid tool');
    const a = args as Record<string, unknown>;
    if (name === 'district_hazard_profile') {
      if (Object.keys(a).some(k => !['district', 'state'].includes(k)) || typeof a.district !== 'string' || typeof a.state !== 'string') throw new Error('invalid tool');
      if (a.district !== this.data!.district_name || a.state !== this.data!.state) return { label: LABEL, status: 'unavailable', explanation: 'Real districts and restricted data are unavailable in this showcase.' };
      return { label: LABEL, status: 'ok', district: this.data!.district_name, state: this.data!.state,
        overall_screening_index: this.data!.hex_risk, flood_screening_index: this.data!.flood_risk, heat_screening_index: this.data!.heat_risk };
    }
    if (!['method_notes', 'describe_capabilities'].includes(name) || Object.keys(a).length) throw new Error('invalid tool');
    return { label: LABEL, status: 'ok', explanation: name === 'method_notes'
      ? 'Screening indices are invented demonstration scores, not probabilities. They are not validated predictions and must not guide operational or life-safety decisions.'
      : 'I can demonstrate read-only hazard screening tools for SYNTHETIC District Alpha in SYNTHETIC State, and explain their limitations. Real observations, forecasts, WASH records and other districts are unavailable.' };
  }
  async answer(owner: string, question: string, sid?: string) {
    for (const [id, s] of Array.from(this.sessions)) if (s.expires <= this.now()) this.sessions.delete(id);
    const previous = sid ? this.sessions.get(sid) : undefined;
    if (sid && (!previous || previous.owner !== owner)) throw new Error('session');
    if (!sid && this.sessions.size >= 100) throw new Error('limit');
    const lease = await this.acquire();
    const ctl = new AbortController(); this.controllers.add(ctl);
    const timer = setTimeout(() => ctl.abort(), LIMITS.timeoutMs);
    const start = this.now();
    const turn: Message[] = [{ role: 'user', content: question }];
    const messages: Message[] = [{ role: 'system', content: SYSTEM }, ...(previous?.turns.slice(-2).flat() ?? []), ...turn];
    const call = async (choice: 'auto' | 'none') => {
      if (!(await this.status()).enabled || ctl.signal.aborted) throw new Error('off');
      const r = await this.fetcher(demoEndpoint(this.env.BHOOMI_DEMO_ENDPOINT!), { method: 'POST', redirect: 'error', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.env.BHOOMI_DEMO_EDGE_KEY },
        body: JSON.stringify({ model: DEMO_MODEL, messages, tools, tool_choice: choice, stream: false, temperature: 0, max_tokens: 400 }) });
      if (!r.ok) throw new Error('upstream');
      // Bounded streaming read, including the response body in the overall deadline.
      const reader = r.body?.getReader(); if (!reader) throw new Error('upstream');
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 64_000) throw new Error('oversize'); chunks.push(value); } }
      finally { await reader.cancel(); }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.model !== DEMO_MODEL || body.choices?.length !== 1 || body.choices[0].message?.role !== 'assistant') throw new Error('identity');
      return body.choices[0].message;
    };
    try {
      const first = await call('auto');
      if (!Array.isArray(first.tool_calls) || !first.tool_calls.length || first.tool_calls.length > 3) throw new Error('missing tools');
      // Discard all model-generated prose, arguments and identifiers from public output/history.
      const results: { name: string; value: ReturnType<ShowcaseDemo['execute']> }[] = [];
      const cleanCalls = first.tool_calls.map((c: any, i: number) => {
        if (c.type !== 'function' || typeof c.function?.arguments !== 'string' || c.function.arguments.length > 1000) throw new Error('invalid tool');
        const args = JSON.parse(c.function.arguments); const value = this.execute(c.function.name, args);
        results.push({ name: c.function.name, value });
        return { id: 'demo_call_' + i, type: 'function', function: { name: c.function.name, arguments: JSON.stringify(args) } };
      });
      const assistant: Message = { role: 'assistant', content: null, tool_calls: cleanCalls };
      messages.push(assistant); turn.push(assistant);
      for (const [i, result] of Array.from(results.entries())) {
        const m = { role: 'tool', tool_call_id: cleanCalls[i].id, content: JSON.stringify(result.value) }; messages.push(m); turn.push(m);
      }
      const final = await call('none');
      if (final.tool_calls?.length || typeof final.content !== 'string' || !final.content.trim()) throw new Error('invalid final');
      if (!(await this.status()).enabled || ctl.signal.aborted) throw new Error('off');
      const parts = results.map(({ value: v }) => 'overall_screening_index' in v
        ? `DEMONSTRATION DATA: ${v.district}, ${v.state}. Invented overall screening index: ${v.overall_screening_index}; flood screening index: ${v.flood_screening_index}; heat screening index: ${v.heat_screening_index}.`
        : v.explanation);
      const answer = LABEL + '\n\n' + Array.from(new Set(parts)).join('\n\n') + '\n\nThese invented screening scores are not probabilities. No real scientific data or predictions are served.';
      turn.push({ role: 'assistant', content: answer });
      const id = sid ?? randomBytes(12).toString('hex');
      this.sessions.set(id, { owner, expires: this.now() + 30 * 60_000, turns: [...(previous?.turns ?? []).slice(-1), turn] });
      return { interaction_id: randomBytes(16).toString('hex'), session_id: id, status: 'demonstration', answer,
        evidence: LABEL, notes: ['The real model selects tools; the backend renders approved synthetic results and explanations. Model-generated prose is not displayed.', 'Demo chats are held briefly in server memory; no research feedback or training record is created.'],
        verification: { passed: false, violations: [] }, tool_trace: results.map((v, i) => ({ step: i + 1, latency_s: 0, calls: [{ name: v.name, arguments: {}, status: v.value.status }] })),
        latency_s: (this.now() - start) / 1000, model: { name: DEMO_MODEL, label: 'Bhoomi-LLM v1 checkpoint-160 showcase', experimental: true, deployable: false } };
    } catch (e) { await this.off(); throw e; }
    finally { clearTimeout(timer); this.controllers.delete(ctl); await this.release(lease); }
  }
  register(router: Router, reauthenticate: (req: any) => Promise<unknown>) {
    router.post('/bhoomiai/api/demo/chat', async (req, res) => {
      if (!(await this.status()).enabled) return res.status(503).json({ message: 'Showcase demo is off.' });
      const p = parseBetaChat(req.body, 1000); if (!p.ok) return res.status(400).json({ message: p.error });
      try { const reply = await this.answer(req.beta!.userHash, p.message, p.sessionId); await reauthenticate(req); res.json(reply); }
      catch (e) { const code = (e as Error).message;
        res.status(code === 'session' ? 400 : ['busy', 'limit'].includes(code) ? 429 : 503).json({ message: code === 'session' ? 'Invalid demo conversation.' : ['busy', 'limit'].includes(code) ? 'Shared demo limit reached; try later.' : 'Showcase demo is off or unavailable.' }); }
    });
    router.post('/bhoomiai/api/demo/off', async (req, res) => {
      if (req.beta?.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden.' });
      await this.off(); await this.store.audit(req.beta.userHash, 'showcase_demo_off'); res.json({ ok: true, enabled: false });
    });
  }
}
