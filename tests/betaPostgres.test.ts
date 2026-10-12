import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import express from "express";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { PgDatabase } from "../server/beta/pgDatabase";
import { PostgresBetaStore } from "../server/beta/pgStore";
import { PostgresLimiter } from "../server/beta/pgLimits";
import { DEFAULT_LIMITS } from "../server/beta/limits";
import { CodeAuth } from "../server/beta/codeAuth";
import { generateAccessCode, hashAccessCode, checkAccessCode } from "../server/beta/accessCodes";
import { createBetaRouter, type BetaConfig } from "../server/beta/gateway";
import { registerBetaProxy } from "../server/betaProxy";
import { CONSENT_VERSION } from "../shared/betaFeedback";

test('access codes: random, unique, salted scrypt hashes; email cannot substitute for a code',async()=>{
 const one=generateAccessCode(),two=generateAccessCode();assert.notEqual(one,two);assert.equal(one.length,43);
 const hash=await hashAccessCode(one),other=await hashAccessCode(one);assert.notEqual(hash,other);assert.ok(!hash.includes(one));
 assert.equal(await checkAccessCode(one,hash),true);assert.equal(await checkAccessCode(two,hash),false);
 assert.equal(await checkAccessCode('alice@example.org',hash),false);assert.equal(await checkAccessCode(one,'malformed'),false);
});

const database=process.env.BETA_TEST_DATABASE_URL;
test('PostgreSQL + private codes + Replit proxy: isolated storage, real transactions and authenticated end-to-end API',async t=>{
 if(!database) throw new Error('Run python3 tests/runBetaPostgresTests.py; disposable PostgreSQL is required');
 const u=new URL(database);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/bhoomi_beta_test');
 const db=new PgDatabase(database),store=new PostgresBetaStore(db,'local-test-hmac-key-'.repeat(3));
 const servers:http.Server[]=[];
 const listen=async(app:express.Express)=>{const s=http.createServer(app);servers.push(s);await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${(s.address() as any).port}`;};
 try {
  await db.transaction(async()=>{await db.query(await fs.readFile('deploy/beta/migrations/001_beta.sql','utf8'));await db.query(await fs.readFile('deploy/beta/migrations/002_access_codes.sql','utf8'));});
  await db.assertReady();
  await store.invite('owner@example.org','admin','operator');await store.invite('alice@example.org','user','operator');await store.invite('bob@example.org','user','operator');
  await t.test('last administrator removal stays protected under concurrent changes',async()=>{
   await store.invite('owner2@example.org','admin','operator');
   const results=await Promise.allSettled(['owner@example.org','owner2@example.org'].map(email=>store.manageUser(email,{role:'user'},'operator')));
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   await store.manageUser('owner@example.org',{role:'admin'},'operator');
  });
  await t.test('two limiter instances cannot exceed transactional global/day/concurrency caps',async()=>{
   const limits={...DEFAULT_LIMITS,perMinute:100,perHour:100,perDay:4,globalPerDay:4,globalConcurrent:2,perUserConcurrent:2,reservationSeconds:10};
   const a=new PostgresLimiter(limits,store),b=new PostgresLimiter(limits,new PostgresBetaStore(new PgDatabase(database),'local-test-hmac-key-'.repeat(3)));
   try {
    const results=await Promise.allSettled(Array.from({length:30},(_,i)=>(i%2?a:b).acquire(store.hash(i%2?'alice@example.org':'bob@example.org'))));
    const slots=results.filter((r):r is PromiseFulfilledResult<any>=>r.status==='fulfilled');assert.equal(slots.length,2);
    await Promise.all(slots.map(r=>r.value.release(1)));
    const next=await a.acquire(store.hash('alice@example.org'));await next.release(1);
    const final=await b.acquire(store.hash('bob@example.org'));await final.release(1);
    await assert.rejects(a.acquire(store.hash('alice@example.org')),/limit/);
    const total=await store.dayTotals(new Date().toISOString().slice(0,10));assert.equal(total.requests,4);assert.equal(total.gpuSeconds,40);
    await store.setSetting('paused','true');await assert.rejects(b.acquire(store.hash('bob@example.org')),/limit/);await store.setSetting('paused','false');
   } finally {await (b as any).store.close();}
  });
  await t.test('CLI issues private owner-only files, stores hashes, and can revoke without printing codes',async()=>{
   const dir=await fs.mkdtemp(path.join(os.tmpdir(),'beta-code-cli-')),file=path.join(dir,'invitation.txt');
   try {
    const env={...process.env,BETA_DATABASE_URL:database,BETA_HASH_KEY:'local-test-hmac-key-'.repeat(3),BETA_OPERATOR_ID:'operator',BETA_INVITATION_FILE:file};
    const output=await promisify(execFile)(process.execPath,['--import','tsx','scripts/beta-admin.ts','invite','cli@example.org','user'],{env});
    const details=await fs.readFile(file,'utf8'),code=details.match(/Private access code: (.+)/)![1];
    assert.ok(!output.stdout.includes(code));assert.equal((await fs.stat(file)).mode&0o777,0o600);
    const record=await db.prepare('SELECT access_code_hash FROM users WHERE email=?').get('cli@example.org');assert.equal(await checkAccessCode(code,record!.access_code_hash),true);
    await assert.rejects(promisify(execFile)(process.execPath,['--import','tsx','scripts/beta-admin.ts','invite','cli@example.org','user'],{env}));
    await promisify(execFile)(process.execPath,['--import','tsx','scripts/beta-admin.ts','revoke','cli@example.org'],{env});
    assert.equal((await store.getUser('cli@example.org'))!.status,'suspended');
   } finally {await fs.rm(dir,{recursive:true});}
  });
  await t.test('actual gateway entrypoint boots in code/PostgreSQL mode with inference disarmed',async()=>{
   const reserve=http.createServer();await new Promise<void>(r=>reserve.listen(0,'127.0.0.1',r));const port=String((reserve.address() as any).port);await new Promise<void>(r=>reserve.close(()=>r()));
   const child=spawn(process.execPath,['--import','tsx','server/betaServer.ts'],{env:{...process.env,BETA_DATABASE_URL:database,BETA_HASH_KEY:'local-test-hmac-key-'.repeat(3),BETA_AUTH_MODE:'code',BETA_AUTH_PROVIDER:'code',BETA_INGRESS_MODE:'proxy',BETA_ORIGIN_KEY:'runtime-local-origin-key-'.repeat(3),BETA_PUBLIC_ORIGIN:'https://climreswash.in',BETA_PORT:port,BETA_CLOUD_APPROVED:'0'},stdio:['ignore','pipe','pipe']});
   child.stdout!.resume();child.stderr!.resume();
   try {
    let response:Response|undefined;
    for(let i=0;i<50;i++){
     try {response=await fetch('http://127.0.0.1:'+port+'/bhoomiai/api/me',{headers:{'x-bhoomi-origin-key':'runtime-local-origin-key-'.repeat(3)}});break;}catch{await new Promise(r=>setTimeout(r,50));}
    }
    assert.equal(response?.status,401);assert.match(response!.headers.get('content-type')!,/json/);
   } finally {child.kill();await new Promise<void>(r=>child.once('exit',()=>r()));}
  });
  await t.test('per-user quotas and compute reservations remain exact under concurrent admission',async()=>{
   await store.invite('quota@example.org','user','operator');await store.manageUser('quota@example.org',{quota:3},'operator');
   const limiter=new PostgresLimiter({...DEFAULT_LIMITS,perMinute:100,perHour:100,globalPerDay:100,globalConcurrent:30,perUserConcurrent:30,reservationSeconds:10},store);
   const results=await Promise.allSettled(Array.from({length:30},async()=>{const slot=await limiter.acquire(store.hash('quota@example.org'));await slot.release(1);}));
   assert.equal(results.filter(r=>r.status==='fulfilled').length,3);const usage=await store.userDay(store.hash('quota@example.org'),new Date().toISOString().slice(0,10));assert.equal(usage.requests,3);assert.equal(usage.gpuSeconds,30);
  });
  const codes=new Map<string,string>();
  for(const email of ['alice@example.org','bob@example.org','owner@example.org']){
   const code=generateAccessCode();codes.set(email,code);await store.setAccessCodeHash(email,await hashAccessCode(code),'operator');
  }
  let authTime=0;
  const codeAuth=new CodeAuth(store,'https://climreswash.in',28800,()=>Date.now()+authTime);
  const config:BetaConfig={hosted:true,authMode:'code',codeAuth,originKey:'local-origin-key-'.repeat(3),publicOrigin:'https://climreswash.in',inferenceReady:true,
   limits:{...DEFAULT_LIMITS,perMinute:100,perHour:100,globalPerDay:100,perDay:100,reservationSeconds:10},coreUrl:'http://127.0.0.1:8765',
   model:{label:'Bhoomi-LLM v1 checkpoint-160',experimental:true,baseModel:'Qwen3-4B-Instruct-2507',note:'Experimental'}};
  let coreCalls=0;
  const gateway=express();gateway.use(express.json());gateway.use(createBetaRouter({store,config,limiter:new PostgresLimiter(config.limits,store),fetchImpl:(async()=>{
   coreCalls++;await new Promise(r=>setTimeout(r,50));return Response.json({interaction_id:randomBytes(16).toString('hex'),session_id:randomBytes(12).toString('hex'),status:'verified',answer:'Kota, Rajasthan screening index 2.50 [F1].',verification:{passed:true},model:{experimental:true,deployable:false,label:config.model.label},tool_trace:[],latency_s:.1});
  }) as typeof fetch}));
  const origin=await listen(gateway),site=express();
  let fail=false;
  registerBetaProxy(site,'https://gateway.example.test',(async(url,init)=>{
   if(fail)throw new Error('private path/password must not escape');
   return fetch(origin+new URL(String(url)).pathname+new URL(String(url)).search,{...init,redirect:'manual'});
  }) as typeof fetch,{originKey:config.originKey,publicOrigin:config.publicOrigin});
  site.get('/',(_q,r)=>r.send('existing public home'));site.get('/hex-map-v2',(_q,r)=>r.send('existing GIS route'));site.get('*',(_q,r)=>r.send('SPA shell'));
  const web=await listen(site);
  const request=(path:string,cookie='',body?:unknown,host='climreswash.in')=>new Promise<Response>((resolve,reject)=>{
   const payload=body===undefined?undefined:JSON.stringify(body);
   const req=http.request(web+path,{method:payload===undefined?'GET':'POST',headers:{host,cookie,origin:config.publicOrigin!,'Content-Type':'application/json','x-user-email':'owner@example.org','x-bhoomi-origin-key':'forged',...(payload===undefined?{}:{'Content-Length':Buffer.byteLength(payload)})}},response=>{
    const chunks:Buffer[]=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{
     const headers=new Headers();for(const [name,value]of Object.entries(response.headers)){for(const item of Array.isArray(value)?value:[value])if(item!==undefined)headers.append(name,item);}
     resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers}));
    });
   });req.on('error',reject);req.end(payload);
  });
  async function login(over:Record<string,unknown>={}){
   const email=String(over.email??'alice@example.org');
   const response=await request('/bhoomiai/api/auth/login','',{email,access_code:codes.get(email),...over});
   return {response,cookie:response.headers.getSetCookie().find(s=>s.startsWith('BhoomiSession='))?.split(';')[0]??''};
  }
  await t.test('forged headers, direct origin, email-only and wrong/uninvited codes fail',async()=>{
   assert.equal((await request('/bhoomiai/api/me')).status,401);
   assert.equal((await fetch(origin+'/bhoomiai/api/me')).status,403);
   assert.equal((await request('/bhoomiai/api/me','',undefined,'direct.replit.app')).status,403);
   assert.equal((await login({access_code:'wrong'})).response.status,401);
   assert.equal((await login({email:'stranger@example.org',access_code:codes.get('alice@example.org')})).response.status,401);
   assert.equal((await login({email:'bob@example.org',access_code:codes.get('alice@example.org')})).response.status,401);
   assert.equal((await request('/bhoomiai/api/auth/login','',{email:'alice@example.org'})).status,400);
   const auth=await login();assert.equal(auth.response.status,200);const cookies=auth.response.headers.getSetCookie().join(';');
   for(const flag of [/HttpOnly/,/Secure/,/SameSite=Lax/,/Path=\/bhoomiai/])assert.match(cookies,flag);
   assert.equal((await request('/bhoomiai/api/me',auth.cookie.replace(/=.*/, '=forged'))).status,401);
   await db.query('DELETE FROM login_attempts');
  });
  const alice=await login();assert.ok(alice.cookie);
  await t.test('consent/chat/feedback/history/admin/export persist; users cannot cross ownership',async()=>{
   assert.equal((await request('/bhoomiai/api/admin/users',alice.cookie)).status,403);
   assert.equal((await request('/bhoomiai/api/chat',alice.cookie,{message:'Kota screening index?'})).status,428);
   assert.equal((await request('/bhoomiai/api/consent',alice.cookie,{version:CONSENT_VERSION,research:true,training:false})).status,200);
   const response=await request('/bhoomiai/api/chat',alice.cookie,{message:'Kota screening index?'});assert.equal(response.status,200);
   const answer=await response.json();assert.match(answer.answer,/Kota/);assert.equal(coreCalls,1);
   assert.equal((await request('/bhoomiai/api/feedback',alice.cookie,{interaction_id:answer.interaction_id,rating:'down',categories:[],suggested_correction:'Explain the index'})).status,200);
   const bob=await login({email:'bob@example.org'});
   await request('/bhoomiai/api/consent',bob.cookie,{version:CONSENT_VERSION,research:true,training:false});
   assert.equal((await request('/bhoomiai/api/feedback',bob.cookie,{interaction_id:answer.interaction_id,rating:'up'})).status,400);
   assert.equal((await (await request('/bhoomiai/api/history',bob.cookie)).json()).items.length,0);
   const owner=await login({email:'owner@example.org'});
   assert.equal((await request('/bhoomiai/api/admin/users',owner.cookie)).status,200);
   for(const endpoint of ['/bhoomiai/api/stream','/bhoomiai/api/tools','/bhoomiai/api/debug'])assert.equal((await request(endpoint,owner.cookie)).status,404);
   const rows=await (await request('/bhoomiai/api/admin/feedback',owner.cookie)).json();assert.equal(rows.items.length,1);
   assert.equal((await request('/bhoomiai/api/admin/feedback/'+rows.items[0].feedback_id+'/review',owner.cookie,{review_status:'triaged',notes:'checked'})).status,200);
   const exported=await request('/bhoomiai/api/admin/export',owner.cookie);assert.equal(exported.status,200);const line=JSON.parse((await exported.text()).split('\n')[0]);assert.equal(line.training_use_authorized,false);assert.equal(line.consent_training,false);
   const second=new PostgresBetaStore(new PgDatabase(database),'local-test-hmac-key-'.repeat(3));
   assert.equal((await second.history(store.hash('alice@example.org'))).length,1);await second.close();
  });
  await t.test('async database admission reserves a Core worker before competing HTTP requests',async()=>{
   const bob=await login({email:'bob@example.org'});
   const before=coreCalls;
   const results=await Promise.all([request('/bhoomiai/api/chat',alice.cookie,{message:'Kota index?'}),request('/bhoomiai/api/chat',bob.cookie,{message:'Kota index?'})]);
   assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);assert.equal(coreCalls,before+1);
  });
  await t.test('logout/revocation invalidates existing sessions; restore cannot resurrect them',async()=>{
   const fresh=await login();assert.equal((await request('/bhoomiai/api/logout',fresh.cookie,{})).status,200);
   assert.equal((await request('/bhoomiai/api/me',fresh.cookie)).status,401);
   assert.equal((await login({access_code:'wrong'})).response.status,401);
   await store.manageUser('alice@example.org',{status:'suspended'},'operator');assert.equal((await request('/bhoomiai/api/me',alice.cookie)).status,401);
   await store.manageUser('alice@example.org',{status:'active'},'operator');assert.equal((await request('/bhoomiai/api/me',alice.cookie)).status,401);
  });
  await t.test('rotation invalidates old codes/sessions, expiry works, and durable throttles deny attempts',async()=>{
   await db.query('DELETE FROM login_attempts');
   const old=codes.get('alice@example.org')!;
   const rotated=generateAccessCode();await store.setAccessCodeHash('alice@example.org',await hashAccessCode(rotated),'operator');codes.set('alice@example.org',rotated);
   assert.equal((await login({access_code:old})).response.status,401);
   const active=await login();assert.equal(active.response.status,200);
   authTime=28800001;assert.equal((await request('/bhoomiai/api/me',active.cookie)).status,401);authTime=0;
   const hash=await db.prepare('SELECT access_code_hash FROM users WHERE email=?').get('alice@example.org');assert.ok(!hash!.access_code_hash.includes(rotated));
   await db.query('DELETE FROM login_attempts');
   for(let i=0;i<5;i++)assert.equal((await login({access_code:'wrong'})).response.status,401);
   assert.equal((await login()).response.status,429);
   await db.query('DELETE FROM login_attempts');
   const timestamp=Date.now();for(let i=0;i<20;i++)await db.prepare('INSERT INTO login_attempts(email_hash,ts) VALUES(?,?)').run(store.hash('random'+i+'@example.org'),timestamp);
   assert.equal((await login({email:'bob@example.org'})).response.status,429);
   await db.query('DELETE FROM login_attempts');
   const denied=await request('/bhoomiai/api/auth/login','',{email:'bob@example.org',access_code:codes.get('bob@example.org')},'direct.replit.app');assert.equal(denied.status,403);
  });
  await t.test('upstream failures and unknown protected paths cannot fall through to HTML; public routes stay available',async()=>{
   fail=true;const result=await request('/bhoomiai/api/chat');assert.equal(result.status,503);assert.match(result.headers.get('content-type')!,/json/);assert.doesNotMatch(await result.text(),/password|private path|SPA/);
   assert.equal(await (await fetch(web)).text(),'existing public home');assert.equal(await (await fetch(web+'/hex-map-v2')).text(),'existing GIS route');
   fail=false;assert.equal((await request('/bhoomiai/api/stream')).status,401);assert.equal((await request('/bhoomiai/api/tools')).status,401);
  });
 } finally {for(const s of servers){s.closeAllConnections();await new Promise<void>(r=>s.close(()=>r()));}await store.close();}
});
