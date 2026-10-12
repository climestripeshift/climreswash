import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface ManagedCommand { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }
// Beta failures never terminate the public Express process. Three retries, then fail closed.
export class BetaSupervisor {
  private children = new Set<ChildProcess>();
  private stopped = false;
  private attempts = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private commands: ManagedCommand[], private report: (state:string)=>void = () => {}, private delayMs=1000) {}
  start() { if(!this.stopped)this.launch(); }
  private launch() {
    let failed=false;
    for(const spec of this.commands) {
      if(failed)break;
      const child=spawn(spec.command,spec.args,{cwd:spec.cwd,env:spec.env,stdio:"ignore"});
      this.children.add(child);
      const fail=()=>{
        this.children.delete(child);
        if(failed||this.stopped)return;
        failed=true;this.kill();this.report("unavailable");
        if(this.attempts++<3){this.timer=setTimeout(()=>this.launch(),this.delayMs*this.attempts);this.timer.unref();}
        else this.report("retry_limit");
      };
      child.once("error",fail);child.once("exit",fail);
    }
    if(!failed)this.report("starting");
  }
  private kill() {
    for(const child of Array.from(this.children)) {child.removeAllListeners("exit");child.kill("SIGTERM");const t=setTimeout(()=>child.kill("SIGKILL"),2000);t.unref();}
    this.children.clear();
  }
  stop() {this.stopped=true;if(this.timer)clearTimeout(this.timer);this.kill();}
}

export function prepareColocatedBeta(env=process.env, root=process.cwd()) {
  if(env.BHOOMI_BETA_COLOCATE!=="1")return undefined;
  const port=Number(env.BETA_PORT??5100);
  if(!Number.isSafeInteger(port)||port<1024||port>65535||port===Number(env.PORT??5000))throw new Error("Invalid private gateway port");
  if(!env.BETA_DATABASE_URL || !env.BETA_HASH_KEY || env.BETA_HASH_KEY.length<32 || !env.BETA_ORIGIN_KEY || env.BETA_ORIGIN_KEY.length<32 || !env.BETA_PUBLIC_ORIGIN)throw new Error("Incomplete private beta configuration");
  // Never inherit the public database owner credentials or public-session secrets into beta children.
  const privateEnv:NodeJS.ProcessEnv={};
  for(const [name,value]of Object.entries(env))if(/^(BETA_|BHOOMI_|RELAY_)/.test(name)||["PATH","HOME","TMPDIR","LANG","RUNPOD_API_KEY","REPL_ID"].includes(name))privateEnv[name]=value;
  Object.assign(privateEnv,{BETA_AUTH_MODE:"code",BETA_AUTH_PROVIDER:"code",BETA_INGRESS_MODE:"proxy",BETA_LISTEN_HOST:"127.0.0.1",BETA_PORT:String(port),NODE_ENV:"production"});
  const commands:ManagedCommand[]=[];
  if(env.BETA_CLOUD_APPROVED==="1") {
    const approval=env.BETA_APPROVAL_MANIFEST&&JSON.parse(fs.readFileSync(env.BETA_APPROVAL_MANIFEST,"utf8"));
    if(approval?.approved!==true||!approval.data_bundle_sha256||!approval.model?.adapter_sha256||!env.RUNPOD_API_KEY)throw new Error("Core requires explicit data/model/cloud approval");
    const coreRoot=path.resolve(env.BETA_CORE_ROOT??path.join(root,"research/bhoomi_ai_core_v0"));
    const cache=path.resolve(env.BETA_CORE_CACHE_DIR??"/tmp/bhoomi-core");fs.mkdirSync(cache,{recursive:true,mode:0o700});
    const coreEnv={...privateEnv,NODE_ENV:"research",BHOOMI_AI_ENV:"research",BHOOMI_DEPLOYMENT_PROFILE:"cloud_beta",BHOOMI_GATEWAY_KEY:env.BETA_ORIGIN_KEY,BHOOMI_CORE_DATA_DIR:cache,PYTHONPATH:path.join(coreRoot,"src")};
    // One Core per replica. Global concurrency/quotas live in PostgreSQL, not in replica counters.
    privateEnv.BETA_CORE_URL="http://127.0.0.1:8765";
    commands.push({command:"python3",args:[path.join(root,"deploy/beta/runpod_relay.py")],cwd:root,env:privateEnv});
    commands.push({command:"python3",args:["-m","bhoomi_ai","--port","8765"],cwd:coreRoot,env:coreEnv});
  }
  commands.push({command:process.execPath,args:["--import","tsx",path.join(root,"server/betaServer.ts")],cwd:root,env:privateEnv});
  const supervisor=new BetaSupervisor(commands,state=>console.log(`[beta] ${state}`));
  return {gatewayUrl:`http://127.0.0.1:${port}`,supervisor};
}
