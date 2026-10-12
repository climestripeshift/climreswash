import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { BetaSupervisor,prepareColocatedBeta } from '../server/beta/supervisor';
import { PgDatabase } from '../server/beta/pgDatabase';

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
