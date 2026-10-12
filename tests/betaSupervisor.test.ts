import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { BetaSupervisor,prepareColocatedBeta } from '../server/beta/supervisor';
import { PgDatabase } from '../server/beta/pgDatabase';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('cohosting is opt-in; children receive beta credentials only; disarmed mode starts no Core/relay',()=>{
 assert.equal(prepareColocatedBeta({}),undefined);
 assert.throws(()=>prepareColocatedBeta({BHOOMI_BETA_COLOCATE:'1'}));
 const config=prepareColocatedBeta({BHOOMI_BETA_COLOCATE:'1',DATABASE_URL:'do-not-copy',SESSION_SECRET:'do-not-copy',BETA_DATABASE_URL:'postgresql://runtime@localhost/beta',BETA_HASH_KEY:'h'.repeat(40),BETA_ORIGIN_KEY:'o'.repeat(40),BETA_PUBLIC_ORIGIN:'https://climreswash.in',BETA_CLOUD_APPROVED:'0'})!;
 assert.equal(config.gatewayUrl,'http://127.0.0.1:5100');
 const commands=(config.supervisor as any).commands;assert.equal(commands.length,1);assert.equal(commands[0].env.DATABASE_URL,undefined);assert.equal(commands[0].env.SESSION_SECRET,undefined);assert.equal(commands[0].env.BETA_LISTEN_HOST,'127.0.0.1');
 assert.throws(()=>prepareColocatedBeta({BHOOMI_BETA_COLOCATE:'1',BETA_DATABASE_URL:'local',BETA_HASH_KEY:'h'.repeat(40),BETA_ORIGIN_KEY:'o'.repeat(40),BETA_PUBLIC_ORIGIN:'https://climreswash.in',BETA_CLOUD_APPROVED:'1'}));
});
test('beta crashes retry finitely while public routes stay reachable; stop cleans children',async()=>{
 const states:string[]=[];const supervisor=new BetaSupervisor([{command:process.execPath,args:['-e','process.exit(2)'],cwd:process.cwd(),env:{}}],s=>states.push(s),5);
 const app=express();app.get('/',(_q,r)=>r.send('public home/maps'));const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try {
  supervisor.start();for(let i=0;i<100&&!states.includes('retry_limit');i++)await new Promise(r=>setTimeout(r,10));
  assert.ok(states.includes('retry_limit'));assert.equal(states.filter(s=>s==='unavailable').length,4);
  assert.equal(await(await fetch('http://127.0.0.1:'+(server.address() as any).port)).text(),'public home/maps');
 }finally{supervisor.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test('Helium transport is explicit and pinned; arbitrary plaintext remote database URLs are denied',async()=>{
 assert.throws(()=>new PgDatabase('postgresql://user@helium/heliumdb'),/verified TLS/);
 const internal=new PgDatabase('postgresql://user@helium/heliumdb','replit-helium');await internal.close();
 for(const url of ['postgresql://user@evil.example/heliumdb','postgresql://user@helium/other','postgresql://user@helium:1234/heliumdb'])assert.throws(()=>new PgDatabase(url,'replit-helium'));
});

const approvedEnv=(tmp:string,extra:Record<string,string>={})=>{
 const upstream=extra.RELAY_UPSTREAM??'https://api.runpod.ai/v2/abcdef123/openai/v1';
 const approval=JSON.stringify({approved:true,approved_by:'owner',endpoint:upstream,served_model:'bhoomi-llm-v1-ckpt160',data_bundle_sha256:'a'.repeat(64),model:{registry_id:'adapter-B-full2ep-experimental-machine-verified',base_revision:'c'.repeat(40),adapter_sha256:'b'.repeat(64)}});
 return {BHOOMI_BETA_COLOCATE:'1',DATABASE_URL:'public-owner-url',SESSION_SECRET:'public-session',BETA_DATABASE_URL:'postgresql://runtime@localhost/beta',BETA_HASH_KEY:'h'.repeat(40),BETA_ORIGIN_KEY:'o'.repeat(40),
  BETA_PUBLIC_ORIGIN:'https://climreswash.in',BETA_CLOUD_APPROVED:'1',BETA_APPROVAL_JSON:approval,BETA_RUN_DIR:path.join(tmp,'run'),BETA_CORE_ROOT:path.join(tmp,'core'),
  RELAY_UPSTREAM:upstream,RELAY_MODEL:'bhoomi-llm-v1-ckpt160',RUNPOD_API_KEY:'rp-account-secret',RUNPOD_MONITOR_API_KEY:'rp-monitor-secret',...extra} as NodeJS.ProcessEnv;
};
const specs=(c:any)=>{const cmds=(c.supervisor as any).commands as {args:string[];env:NodeJS.ProcessEnv}[];const by=(needle:string)=>cmds.find(x=>x.args.join(' ').includes(needle))!;
 return {count:cmds.length,relay:by('runpod_relay.py'),monitor:by('billing_monitor.py'),core:by('bhoomi_ai'),gateway:by('betaServer.ts')};};
test('approved serverless mode: relay+monitor+Core+gateway, least-privilege credentials, Core data inside its root, approval from a secret',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'beta-sup-'));
 try {
  const c=specs(prepareColocatedBeta(approvedEnv(tmp),process.cwd())!);
  assert.equal(c.count,4);
  assert.equal(c.relay.env.RUNPOD_API_KEY,'rp-account-secret');assert.equal(c.relay.env.RUNPOD_MONITOR_API_KEY,undefined);
  assert.equal(c.monitor.env.RUNPOD_MONITOR_API_KEY,'rp-monitor-secret');assert.equal(c.monitor.env.RUNPOD_API_KEY,undefined);
  for(const child of [c.core,c.gateway]){for(const k of ['RUNPOD_API_KEY','RUNPOD_MONITOR_API_KEY','RELAY_UPSTREAM_KEY','DATABASE_URL','SESSION_SECRET'])assert.equal(child.env[k],undefined,k);}
  for(const child of [c.relay,c.monitor,c.core,c.gateway]){assert.equal(child.env.DATABASE_URL,undefined);assert.equal(child.env.SESSION_SECRET,undefined);}
  assert.ok((c.core.env.BHOOMI_CORE_DATA_DIR as string).startsWith(path.join(tmp,'core','data')+path.sep));
  assert.ok(fs.statSync(c.core.env.BHOOMI_CORE_DATA_DIR as string).isDirectory());
  assert.equal(c.core.env.BHOOMI_LLM_BASE_URL,'http://127.0.0.1:8081/v1');assert.equal(c.core.env.BHOOMI_LLM_MODEL,'bhoomi-llm-v1-ckpt160');
  assert.equal(c.core.env.BHOOMI_LLM_BACKEND,'openai_compat');assert.equal(c.core.env.BHOOMI_LLM_EXPERIMENTAL,'1');assert.equal(c.core.env.BHOOMI_DEPLOYMENT_PROFILE,'cloud_beta');
  const manifest=c.gateway.env.BETA_APPROVAL_MANIFEST as string;assert.equal(manifest,c.relay.env.RELAY_APPROVAL_FILE);
  assert.equal(JSON.parse(fs.readFileSync(manifest,'utf8')).served_model,'bhoomi-llm-v1-ckpt160');assert.equal(fs.statSync(manifest).mode&0o777,0o600);
  assert.equal(c.relay.env.RELAY_BILLING_FILE,c.monitor.env.MONITOR_OUT);assert.ok(path.dirname(c.monitor.env.MONITOR_OUT as string).startsWith(tmp));
 } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
test('approved Pod mode uses a separate vLLM key and never hands the account key to the relay',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'beta-sup-'));
 try {
  const pod={RELAY_UPSTREAM:'https://zdww5ekt7i887w-8000.proxy.runpod.net/v1'};
  assert.throws(()=>prepareColocatedBeta(approvedEnv(tmp,pod)),/RELAY_UPSTREAM_KEY/);
  const c=specs(prepareColocatedBeta(approvedEnv(tmp,{...pod,RELAY_UPSTREAM_KEY:'v'.repeat(43)}))!);
  assert.equal(c.relay.env.RELAY_UPSTREAM_KEY,'v'.repeat(43));assert.equal(c.relay.env.RUNPOD_API_KEY,undefined);
  assert.equal(c.monitor.env.RUNPOD_MONITOR_API_KEY,'rp-monitor-secret');
  assert.equal(c.core.env.RELAY_UPSTREAM_KEY,undefined);
 } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
test('approval must name the exact pinned upstream and model; unsafe paths and shapes are refused',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'beta-sup-'));
 try {
  const ok=approvedEnv(tmp);
  assert.throws(()=>prepareColocatedBeta({...ok,RELAY_UPSTREAM:'https://api.runpod.ai/v2/zzzzzz999/openai/v1'}),/approval/);   // approval is for another endpoint
  assert.throws(()=>prepareColocatedBeta({...ok,RELAY_MODEL:'attacker/model'}),/approval/);
  assert.throws(()=>prepareColocatedBeta({...ok,RELAY_UPSTREAM:'https://evil.example/v1'}),/approval/);
  assert.throws(()=>prepareColocatedBeta({...ok,BETA_CORE_CACHE_DIR:'/tmp/bhoomi-core'}),/Core data root/);   // the exact default that used to crash Core
  assert.throws(()=>prepareColocatedBeta({...ok,BETA_APPROVAL_JSON:'{"approved":false}'}),/approval/);
  assert.throws(()=>prepareColocatedBeta({...ok,RUNPOD_API_KEY:''}),/RUNPOD_API_KEY/);
  assert.throws(()=>prepareColocatedBeta({...ok,RELAY_PORT:'80'}),/relay port/);
 } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
