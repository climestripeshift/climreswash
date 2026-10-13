// Operator-only PIN rotation/disable. No PIN argument, output, URL or environment variable.
import fs from 'node:fs/promises';
import path from 'node:path';
import {PgDatabase} from '../server/beta/pgDatabase';
import {PostgresBetaStore} from '../server/beta/pgStore';
import {configureSharedPin} from '../server/beta/pinAuth';
async function main(){
  const [action,...rest]=process.argv.slice(2);
  if(rest.length||!['rotate','disable'].includes(action)||!process.env.BETA_DATABASE_URL||!process.env.BETA_HASH_KEY||!process.env.BETA_OPERATOR_ID)
    throw new Error('Operator configuration required');
  const store=new PostgresBetaStore(new PgDatabase(process.env.BETA_DATABASE_URL,
    process.env.BETA_DB_TRANSPORT==='replit-helium'?'replit-helium':'tls'),process.env.BETA_HASH_KEY);
  try{
    let pin:string|null=null;
    if(action==='rotate'){
      const file=process.env.BETA_PIN_INPUT_FILE;
      if(!file||!path.isAbsolute(file))throw new Error('Private PIN input file required');
      const actual=await fs.realpath(file),root=await fs.realpath(new URL('../',import.meta.url));
      if(actual===root||actual.startsWith(root+path.sep))throw new Error('PIN input must be outside repository');
      const stat=await fs.stat(actual);
      if(!stat.isFile()||(stat.mode&0o077)||stat.size>8)throw new Error('Invalid private input file');
      pin=(await fs.readFile(actual,'utf8')).trim();
      if(!/^\d{6}$/.test(pin))throw new Error('Six digits required');
    }
    await configureSharedPin(store,pin,process.env.BETA_OPERATOR_ID);
    console.log(action==='rotate'?'Shared PIN rotated; ordinary PIN sessions revoked.':'Shared PIN disabled; ordinary PIN sessions revoked.');
  }finally{await store.close();}
}
main().catch(()=>{console.error('PIN operator action failed; check private configuration. No secret values logged.');process.exitCode=1;});
