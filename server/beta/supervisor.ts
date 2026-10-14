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

const SERVERLESS_UPSTREAM=/^https:\/\/api\.runpod\.ai\/v2\/[A-Za-z0-9]{6,40}\/openai\/v1$/;
const POD_UPSTREAM=/^https:\/\/[a-z0-9]{8,24}-[0-9]{2,5}\.proxy\.runpod\.net\/v1$/;
// Provider/model credentials: each child receives only the ones it needs. Core executes LLM-selected tools, so it never holds them.
const PROVIDER_SECRETS=["RUNPOD_API_KEY","RUNPOD_MONITOR_API_KEY","RELAY_UPSTREAM_KEY","BHOOMI_DEMO_EDGE_KEY"];
const withoutProviderSecrets=(e:NodeJS.ProcessEnv)=>{const copy={...e};for(const k of PROVIDER_SECRETS)delete copy[k];return copy;};
const DEFAULT_MODEL_ID="adapter-B-full2ep-experimental-machine-verified";

export function prepareColocatedBeta(env=process.env, root=process.cwd()) {
  if(env.BHOOMI_BETA_COLOCATE!=="1")return undefined;
  const port=Number(env.BETA_PORT??5100);
  if(!Number.isSafeInteger(port)||port<1024||port>65535||port===Number(env.PORT??5000))throw new Error("Invalid private gateway port");
  if(!env.BETA_DATABASE_URL || !env.BETA_HASH_KEY || env.BETA_HASH_KEY.length<32 || !env.BETA_ORIGIN_KEY || env.BETA_ORIGIN_KEY.length<32 || !env.BETA_PUBLIC_ORIGIN)throw new Error("Incomplete private beta configuration");
  // Never inherit the public database owner credentials or public-session secrets into beta children.
  const privateEnv:NodeJS.ProcessEnv={};
  for(const [name,value]of Object.entries(env))if(/^(BETA_|BHOOMI_|RELAY_|MONITOR_)/.test(name)||["PATH","HOME","TMPDIR","LANG","REPL_ID",...PROVIDER_SECRETS].includes(name))privateEnv[name]=value;
  Object.assign(privateEnv,{BETA_AUTH_MODE:"code",BETA_AUTH_PROVIDER:"code",BETA_INGRESS_MODE:"proxy",BETA_LISTEN_HOST:"127.0.0.1",BETA_PORT:String(port),NODE_ENV:"production"});
  const commands:ManagedCommand[]=[];
  if (env.BHOOMI_DEMO_ENABLED === "1" && env.BETA_CLOUD_APPROVED === "1")
    throw new Error("Showcase activation requires research inference to remain off");
  if(env.BETA_CLOUD_APPROVED==="1") {
    const coreRoot=path.resolve(env.BETA_CORE_ROOT??path.join(root,"research/bhoomi_ai_core_v0"));
    // Runtime files live outside the checkout's tracked tree; Replit secrets are environment variables, so the approval manifest
    // may be supplied as BETA_APPROVAL_JSON and is materialised here with owner-only permissions.
    const run=path.resolve(env.BETA_RUN_DIR??path.join(env.TMPDIR??"/tmp","bhoomi-beta-run"));fs.mkdirSync(run,{recursive:true,mode:0o700});
    let manifest=env.BETA_APPROVAL_MANIFEST;
    if(env.BETA_APPROVAL_JSON&&(!manifest||!fs.existsSync(manifest))){manifest=path.join(run,"approval.json");fs.writeFileSync(manifest,env.BETA_APPROVAL_JSON,{mode:0o600});}
    const approval=manifest&&JSON.parse(fs.readFileSync(manifest,"utf8"));
    const upstream=(env.RELAY_UPSTREAM??"").replace(/\/+$/,"");
    const serverless=SERVERLESS_UPSTREAM.test(upstream),pod=POD_UPSTREAM.test(upstream);
    if(approval?.approved!==true||!approval.data_bundle_sha256||!approval.model?.adapter_sha256||approval.endpoint!==upstream||approval.served_model!==env.RELAY_MODEL||!env.RELAY_MODEL||(!serverless&&!pod))throw new Error("Core requires explicit data/model/cloud approval for the pinned upstream");
    if(serverless&&!env.RUNPOD_API_KEY)throw new Error("Serverless upstream requires RUNPOD_API_KEY");
    if(pod&&(!env.RELAY_UPSTREAM_KEY||!env.RUNPOD_MONITOR_API_KEY))throw new Error("Pod upstream requires RELAY_UPSTREAM_KEY and RUNPOD_MONITOR_API_KEY");
    // Core's cloud_beta profile only accepts a data directory inside its own data root (fail-closed file access).
    const coreData=path.resolve(env.BETA_CORE_CACHE_DIR??path.join(coreRoot,"data","beta-cache"));
    if(!(coreData+path.sep).startsWith(path.join(coreRoot,"data")+path.sep))throw new Error("BETA_CORE_CACHE_DIR must be inside the Core data root");
    fs.mkdirSync(coreData,{recursive:true,mode:0o700});
    const billing=env.RELAY_BILLING_FILE??path.join(run,"billing-attestation.json");
    const relayPort=Number(env.RELAY_PORT??8081);
    if(!Number.isSafeInteger(relayPort)||relayPort<1024||relayPort>65535)throw new Error("Invalid relay port");
    Object.assign(privateEnv,{BETA_APPROVAL_MANIFEST:manifest,RELAY_APPROVAL_FILE:manifest,RELAY_BILLING_FILE:billing,MONITOR_OUT:billing,RELAY_PORT:String(relayPort)});
    const base=withoutProviderSecrets(privateEnv);
    // Model settings are derived from the relay's so Core can only ever reach the one loopback relay and its one pinned model.
    const coreEnv={...base,NODE_ENV:"research",BHOOMI_AI_ENV:"research",BHOOMI_DEPLOYMENT_PROFILE:"cloud_beta",BHOOMI_GATEWAY_KEY:env.BETA_ORIGIN_KEY,
      BHOOMI_CORE_DATA_DIR:coreData,PYTHONPATH:path.join(coreRoot,"src"),BHOOMI_LLM_BACKEND:"openai_compat",BHOOMI_LLM_EXPERIMENTAL:"1",
      BHOOMI_LLM_BASE_URL:`http://127.0.0.1:${relayPort}/v1`,BHOOMI_LLM_MODEL:env.RELAY_MODEL,
      BHOOMI_LLM_MODEL_ID:env.BHOOMI_LLM_MODEL_ID??DEFAULT_MODEL_ID,
      BHOOMI_LLM_REGISTRY:env.BHOOMI_LLM_REGISTRY??path.join(root,"research/bhoomi_llm_v1/registry/models.json")};
    // One Core per replica. Global concurrency/quotas live in PostgreSQL, not in replica counters.
    base.BETA_CORE_URL="http://127.0.0.1:8765";
    const relayEnv={...base,...(serverless?{RUNPOD_API_KEY:env.RUNPOD_API_KEY}:{RELAY_UPSTREAM_KEY:env.RELAY_UPSTREAM_KEY})};
    const monitorEnv={...base,RUNPOD_MONITOR_API_KEY:env.RUNPOD_MONITOR_API_KEY??env.RUNPOD_API_KEY};
    commands.push({command:"python3",args:[path.join(root,"deploy/beta/runpod_relay.py")],cwd:root,env:relayEnv});
    commands.push({command:"python3",args:[path.join(root,"deploy/beta/billing_monitor.py")],cwd:root,env:monitorEnv});
    commands.push({command:"python3",args:["-m","bhoomi_ai","--port","8765"],cwd:coreRoot,env:coreEnv});
    commands.push({command:process.execPath,args:["--import","tsx",path.join(root,"server/betaServer.ts")],cwd:root,env:base});
  } else {
    commands.push({command:process.execPath,args:["--import","tsx",path.join(root,"server/betaServer.ts")],cwd:root,env:{...withoutProviderSecrets(privateEnv),...(env.BHOOMI_DEMO_EDGE_KEY?{BHOOMI_DEMO_EDGE_KEY:env.BHOOMI_DEMO_EDGE_KEY}:{})}});
  }
  const supervisor=new BetaSupervisor(commands,state=>console.log(`[beta] ${state}`));
  return {gatewayUrl:`http://127.0.0.1:${port}`,supervisor};
}
