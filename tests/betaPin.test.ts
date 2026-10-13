import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import express from 'express';
import {randomInt,randomBytes} from 'node:crypto';
import {PgDatabase} from '../server/beta/pgDatabase';
import {PostgresBetaStore} from '../server/beta/pgStore';
import {PinAuth,configureSharedPin} from '../server/beta/pinAuth';
import {CodeAuth,tokenHash} from '../server/beta/codeAuth';
import {hashAccessCode} from '../server/beta/accessCodes';
import {createBetaRouter,type BetaConfig} from '../server/beta/gateway';
import {PostgresLimiter} from '../server/beta/pgLimits';
import {DEFAULT_LIMITS} from '../server/beta/limits';
import {Conversations} from '../server/beta/conversations';
import {CONSENT_VERSION} from '../shared/betaFeedback';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';

test('shared PIN: real database authentication, isolation, rotation, lockout and existing safeguards',async t=>{
  const url=process.env.BETA_PIN_TEST_DATABASE_URL;
  if(!url||new URL(url).hostname!=='127.0.0.1'||new URL(url).pathname!=='/bhoomi_pin_test')throw new Error('Disposable local PIN database required');
  let time=Date.now();const clock=()=>time;
  const hashKey=randomBytes(32).toString('hex');
  const db=new PgDatabase(url),store=new PostgresBetaStore(db,hashKey,clock);
  for(const file of ['001_beta.sql','002_access_codes.sql','003_portable_conversations.sql','004_shared_pin.sql'])
    await db.transaction(async()=>{await db.query(await fs.readFile('deploy/beta/migrations/'+file,'utf8'));});
  const origin='https://climreswash.in',pin=String(randomInt(1000000)).padStart(6,'0');
  const adminCode=randomBytes(32).toString('base64url');
  await store.invite('owner@example.org','admin','test');await store.setAccessCodeHash('owner@example.org',await hashAccessCode(adminCode),'test');
  time++;
  const limits={...DEFAULT_LIMITS,perDay:2,globalPerDay:50,globalConcurrent:1,reservationSeconds:1};
  const config:BetaConfig={hosted:true,authMode:'code',originKey:'local-origin-'.repeat(4),publicOrigin:origin,
    codeAuth:new CodeAuth(store,origin,60,clock,new PinAuth(store,origin,60,clock)),conversations:new Conversations(db),
    inferenceReady:false,limits,model:{label:'test',experimental:true,baseModel:'test',note:'test'}};
  const app=express();app.use(express.json());app.use(createBetaRouter({store,config,limiter:new PostgresLimiter(limits,store,clock,true),now:clock}));
  const server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+(server.address() as any).port;
  const request=(path:string,cookie='',body?:object,headers:Record<string,string>={})=>fetch(base+'/bhoomiai/api'+path,{
    method:body?'POST':'GET',headers:{Origin:origin,'x-bhoomi-origin-key':config.originKey!,Cookie:cookie,
      ...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
  const cookies=(r:Response)=>r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
  let a='',b='',admin='';
  try{
    await t.test('disabled by default, exact six digits, CSRF and ingress checks',async()=>{
      assert.equal((await request('/auth/login','',{pin})).status,503);
      await configureSharedPin(store,pin,'test');
      for(const body of [{pin:'x'},{pin:123456},{pin,email:'owner@example.org'},{email:'owner@example.org',access_code:adminCode}])
        assert.equal((await request('/auth/login','',body)).status,400);
      assert.equal((await request('/auth/login','',{pin},{Origin:'https://evil.example'})).status,403);
      assert.equal((await request('/auth/login','',{pin},{'x-bhoomi-origin-key':'wrong'})).status,403);
      const state=await new PinAuth(store,origin).state();assert.ok(!state.shared_pin_hash.includes(pin));
    });
    await t.test('distinct private subjects, secure cookies, consent, admin separation and disabled inference',async()=>{
      const ra=await request('/auth/login','',{pin}),rb=await request('/auth/login','',{pin});
      assert.equal(ra.status,200);assert.equal(rb.status,200);a=cookies(ra);b=cookies(rb);assert.notEqual(a,b);
      for(const value of ra.headers.getSetCookie()){assert.match(value,/HttpOnly/i);assert.match(value,/Secure/i);assert.match(value,/SameSite=Lax/i);}
      assert.equal((await request('/admin/users',a)).status,403);
      assert.equal((await request('/history',a)).status,428);
      assert.equal((await request('/consent',a,{version:CONSENT_VERSION,research:true,training:false})).status,200);
      assert.equal((await request('/chat',a,{message:'test'})).status,503);
      assert.equal((await request('/history',b)).status,428);
      const login=await request('/auth/admin/login','',{email:'owner@example.org',access_code:adminCode});
      assert.equal(login.status,200);admin=cookies(login);assert.equal((await request('/admin/users',admin)).status,200);
      const user='legacy-user@example.org';await store.invite(user,'user','test');
      await store.setAccessCodeHash(user,await hashAccessCode(adminCode),'test');
      assert.equal((await request('/auth/admin/login','',{email:user,access_code:adminCode})).status,401);
    });
    await t.test('shared quota pool survives new visitors and global concurrency/pause still enforce',async()=>{
      const users=(await db.query('SELECT u.user_hash FROM users u JOIN pin_visitors v ON v.email=u.email ORDER BY u.email')).rows;
      const limiter=new PostgresLimiter(limits,store,clock,true);
      const first=await limiter.acquire(users[0].user_hash);await assert.rejects(limiter.acquire(users[1].user_hash));await first.release(0);
      const second=await limiter.acquire(users[1].user_hash);await second.release(0);
      const r=await request('/auth/login','',{pin});assert.equal(r.status,200);
      const sid=cookies(r).match(/BhoomiSession=([^;]+)/)![1];
      const user=(await db.query('SELECT u.user_hash FROM users u JOIN auth_sessions s ON s.email=u.email WHERE s.hash=$1',[tokenHash(sid)])).rows[0];
      await assert.rejects(limiter.acquire(user.user_hash));
      await store.setSetting('paused','true');await assert.rejects(limiter.acquire(store.hash('owner@example.org')));await store.setSetting('paused','false');
    });
    await t.test('logout revokes replay, browser identity survives sign-in, history stays isolated',async()=>{
      const sid=a.match(/BhoomiSession=([^;]+)/)![1];
      const old=(await db.query('SELECT email FROM auth_sessions WHERE hash=$1',[tokenHash(sid)])).rows[0].email;
      await store.logInteraction({id:'a'.repeat(32),userHash:store.hash(old),question:'private test',answer:'test',status:'verified',verified:true,
        verification:{passed:true},toolCalls:[],model:{label:'test'},latencyS:0,unavailable:[],sessionId:'test'});
      await request('/consent',b,{version:CONSENT_VERSION,research:true,training:false});
      assert.equal((await(await request('/history',b)).json()).items.length,0);
      assert.equal((await request('/logout',a,{})).status,200);assert.equal((await request('/me',a)).status,401);
      const login=await request('/auth/login',a,{pin});assert.equal(login.status,200);a=cookies(login);
      const history=await(await request('/history',a)).json();assert.equal(history.items.length,1);
    });
    await t.test('rotation and disable revoke PIN sessions immediately but preserve administrator access',async()=>{
      const next=String((Number(pin)+1)%1000000).padStart(6,'0');
      await configureSharedPin(store,next,'test');assert.equal((await request('/me',a)).status,401);assert.equal((await request('/me',b)).status,401);
      assert.equal((await request('/admin/users',admin)).status,200);
      assert.equal((await request('/auth/login','',{pin})).status,401);
      const login=await request('/auth/login','',{pin:next});assert.equal(login.status,200);
      await configureSharedPin(store,null,'test');assert.equal((await request('/me',cookies(login))).status,401);
      assert.equal((await request('/admin/users',admin)).status,200);
    });
    await t.test('five failures lock PIN across replicas; expiry unlocks; administrator throttle remains separate',async()=>{
      time+=3600001;await configureSharedPin(store,pin,'test');
      const wrong=String((Number(pin)+1)%1000000).padStart(6,'0');
      for(let i=0;i<5;i++)assert.equal((await request('/auth/login','',{pin:wrong})).status,401);
      const locked=await request('/auth/login','',{pin});assert.equal(locked.status,429);assert.equal(locked.headers.get('retry-after'),'900');
      assert.equal((await request('/auth/admin/login','',{email:'owner@example.org',access_code:adminCode})).status,200);
      time+=900001;const login=await request('/auth/login','',{pin});assert.equal(login.status,200);
      time+=60001;assert.equal((await request('/me',cookies(login))).status,401);
    });
    await t.test('operator rotation/disable use private input and never print the PIN or encoded hash',async()=>{
      const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pin-operator-')),file=path.join(dir,'input');
      try{
        const next=String(randomInt(1000000)).padStart(6,'0');await fs.writeFile(file,next,{mode:0o600});
        const env={...process.env,BETA_DATABASE_URL:url,BETA_HASH_KEY:hashKey,BETA_OPERATOR_ID:'test',BETA_PIN_INPUT_FILE:file};
        const result=await promisify(execFile)(process.execPath,['--import','tsx','scripts/beta-pin.ts','rotate'],{env});
        const state=await new PinAuth(store,origin).state();assert.equal(state.shared_pin_enabled,'true');
        assert.ok(!result.stdout.includes(next));assert.ok(!result.stdout.includes(state.shared_pin_hash));
        await fs.chmod(file,0o644);
        await assert.rejects(promisify(execFile)(process.execPath,['--import','tsx','scripts/beta-pin.ts','rotate'],{env}));
        await promisify(execFile)(process.execPath,['--import','tsx','scripts/beta-pin.ts','disable'],{env});
        assert.equal((await new PinAuth(store,origin).state()).shared_pin_enabled,'false');
      }finally{await fs.rm(dir,{recursive:true,force:true});}
    });
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await store.close();}
});
