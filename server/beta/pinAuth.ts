import {randomBytes} from 'node:crypto';
import type {Request,Router} from 'express';
import {AccessError} from './accessJwt';
import {hashAccessCode,checkAccessCode} from './accessCodes';
import {betaCookie,sessionCookie,tokenHash} from './codeAuth';
import type {PostgresBetaStore} from './pgStore';

const visitorCookie='BhoomiVisitor';
const options={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/bhoomiai'};
function visitor(req:Request){
  const values=(req.header('cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(visitorCookie+'='));
  const value=values.length===1?values[0].slice(visitorCookie.length+1):'';
  return /^[A-Za-z0-9_-]{43}$/.test(value)?value:undefined;
}
// PIN hashes are salted scrypt over a server-keyed HMAC, so a database-only leak does not permit offline PIN guessing.
export async function configureSharedPin(store:PostgresBetaStore,pin:string|null,actor:string){
  if(pin!==null&&!/^\d{6}$/.test(pin))throw new Error('PIN must contain exactly six digits');
  const encoded=pin===null?'':await hashAccessCode(store.hash('shared-pin:'+pin));
  await store.db.transaction(async()=>{
    await store.setSetting('shared_pin_enabled',String(pin!==null));
    await store.setSetting('shared_pin_hash',encoded);
    await store.setSetting('shared_pin_generation',randomBytes(32).toString('hex'));
    await store.db.query('DELETE FROM auth_sessions WHERE hash IN (SELECT session_hash FROM pin_sessions)');
    await store.db.prepare('DELETE FROM login_attempts WHERE email_hash IN (?,?)')
      .run(store.hash('shared-pin-failure'),store.hash('shared-pin-success'));
    await store.audit(store.hash(actor),pin===null?'shared_pin_disabled':'shared_pin_rotated');
  });
}

export class PinAuth{
  constructor(private store:PostgresBetaStore,private origin:string,private seconds=28800,private now=Date.now){}
  async state(){
    const rows=await this.store.db.query("SELECT key,value FROM settings WHERE key IN ('shared_pin_enabled','shared_pin_hash','shared_pin_generation')");
    return Object.fromEntries(rows.rows.map(r=>[r.key,r.value])) as Record<string,string>;
  }
  register(router:Router){
    router.post('/bhoomiai/api/auth/login',async(req,res)=>{
      if(req.header('origin')!==this.origin||req.header('sec-fetch-site')==='cross-site'||!req.is('application/json'))
        return res.status(403).json({message:'Forbidden.'});
      if(!req.body||Array.isArray(req.body)||Object.keys(req.body).length!==1||typeof req.body.pin!=='string'||!/^\d{6}$/.test(req.body.pin))
        return res.status(400).json({message:'Enter a 6-digit PIN.'});
      const state=await this.state();
      if(state.shared_pin_enabled!=='true'||!state.shared_pin_hash||!state.shared_pin_generation)
        return res.status(503).json({message:'PIN access is disabled.'});
      const t=this.now(),failure=this.store.hash('shared-pin-failure'),success=this.store.hash('shared-pin-success');
      // Shared durable throttle, including hash-work reservations; no spoofable IP/header or session-reset bypass.
      const attempt=await this.store.db.transaction(async()=>{
        await this.store.db.prepare('DELETE FROM login_attempts WHERE ts<?').run(t-3600000);
        const row=await this.store.db.prepare(`SELECT COUNT(*) FILTER(WHERE ts>? AND email_hash IN (?,?)) AS total,
          COUNT(*) FILTER(WHERE ts>? AND email_hash=?) AS failed FROM login_attempts`).get(t-60000,failure,success,t-900000,failure);
        if(Number(row!.total)>=20||Number(row!.failed)>=5)return undefined;
        return (await this.store.db.query('INSERT INTO login_attempts(email_hash,ts) VALUES($1,$2) RETURNING id',[failure,t])).rows[0].id;
      });
      if(attempt===undefined)return res.status(429).set('Retry-After','900').json({message:'Too many PIN attempts. Try again later.'});
      const correct=await checkAccessCode(this.store.hash('shared-pin:'+req.body.pin),state.shared_pin_hash);
      const sid=randomBytes(32).toString('base64url'),guest=visitor(req)??randomBytes(32).toString('base64url');
      const visitorHash=this.store.hash('pin-visitor:'+guest);
      const ok=await this.store.db.transaction(async()=>{
        const current=await this.state();
        if(!correct||current.shared_pin_enabled!=='true'||current.shared_pin_generation!==state.shared_pin_generation
          ||current.shared_pin_hash!==state.shared_pin_hash)return false;
        let record=await this.store.db.prepare('SELECT email FROM pin_visitors WHERE visitor_hash=? AND expires_at>?').get(visitorHash,this.now());
        if(!record){
          const email='pin-'+randomBytes(24).toString('hex')+'@bhoomi.invalid';
          await this.store.db.prepare("INSERT INTO users(email,user_hash,role,status,invited_at) VALUES(?,?,'user','active',?)").run(email,this.store.hash(email),this.now());
          await this.store.db.prepare('INSERT INTO pin_visitors(visitor_hash,email,expires_at) VALUES(?,?,?) ON CONFLICT(visitor_hash) DO UPDATE SET email=excluded.email,expires_at=excluded.expires_at')
            .run(visitorHash,email,this.now()+30*86400000);
          record={email};
        }
        const user=await this.store.getUser(record.email);
        if(!user||user.role!=='user'||user.status==='suspended'||(user.expires_at!==null&&user.expires_at<=this.now()))return false;
        const old=betaCookie(req);
        if(old)await this.store.db.prepare('DELETE FROM auth_sessions WHERE hash=?').run(tokenHash(old));
        await this.store.db.prepare('INSERT INTO auth_sessions(hash,email,issued_at,expires_at) VALUES(?,?,?,?)')
          .run(tokenHash(sid),record.email,this.now(),this.now()+this.seconds*1000);
        await this.store.db.prepare('INSERT INTO pin_sessions(session_hash,generation) VALUES(?,?)').run(tokenHash(sid),state.shared_pin_generation);
        await this.store.db.prepare('UPDATE login_attempts SET email_hash=? WHERE id=?').run(success,attempt);
        await this.store.audit(this.store.hash(record.email),'pin_login');
        return true;
      });
      if(!ok)return res.status(401).json({message:'PIN is incorrect or access is unavailable.'});
      res.cookie(sessionCookie,sid,{...options,maxAge:this.seconds*1000});
      res.cookie(visitorCookie,guest,{...options,maxAge:30*86400000});
      res.json({ok:true});
    });
  }
  async validateSession(hash:string,userRole:string){
    const record=await this.store.db.prepare('SELECT generation FROM pin_sessions WHERE session_hash=?').get(hash);
    if(!record)return false;
    const current=await this.state();
    if(current.shared_pin_enabled!=='true'||current.shared_pin_generation!==record.generation||userRole!=='user')
      throw new AccessError('PIN session revoked');
    return true;
  }
}
