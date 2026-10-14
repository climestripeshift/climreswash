import { test } from "node:test";
import assert from "node:assert/strict";
import { StartupOutput, startupCode } from "../server/beta/startupDiagnostics";
import { BetaSupervisor } from "../server/beta/supervisor";

test("startup diagnostics accept only fixed phases/codes, never secret output", () => {
  const secret = "postgresql://private-user:private-password@private.example/database";
  const diagnostic = new StartupOutput();
  diagnostic.consume(secret+"\n[beta-start");
  diagnostic.consume('up] {"phase":"database_schema","code":"28P01","message":"'+secret+'"}\n');
  assert.equal(diagnostic.phase, "database_schema");
  assert.equal(diagnostic.classifiedCode(), "28P01");
  diagnostic.consume('[beta-startup] {"phase":"'+secret+'","code":"'+secret+'"}\n');
  assert.equal(diagnostic.phase, "database_schema");
  assert.equal(diagnostic.classifiedCode(), "STARTUP_FAILURE");
  assert.equal(startupCode({code:secret}), "STARTUP_FAILURE");
  assert.equal(startupCode(new SyntaxError(secret)), "SYNTAX_ERROR");
  assert.equal(startupCode(new Error("Apply shared PIN migration before gateway startup")), "PIN_SCHEMA_NOT_READY");
  assert.equal(startupCode(new Error(secret)), "STARTUP_FAILURE");
});

test("startup failures before main classify module and heap errors without forwarding them", () => {
  for (const [text,code] of [
    ["Error [ERR_MODULE_NOT_FOUND]: sensitive path", "ERR_MODULE_NOT_FOUND"],
    ["FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory", "NODE_HEAP_EXHAUSTED"],
  ]) {
    const diagnostic=new StartupOutput();diagnostic.consume(text);
    assert.equal(diagnostic.classifiedCode(),code);
  }
});

test("supervisor logs safe child metadata, preserves finite retries and never forwards stderr", async () => {
  const secret="secret-must-never-appear";
  const original=console.error,output:string[]=[];
  let finish!:()=>void;
  const finished=new Promise<void>(resolve=>{finish=resolve;});
  const supervisor=new BetaSupervisor([{
    component:"gateway",command:process.execPath,
    args:["-e",`console.error(${JSON.stringify(secret)});console.error('[beta-startup] {"phase":"database_schema","code":"28P01"}');process.exit(1);`],
    cwd:process.cwd(),env:{},
  }],state=>{if(state==="retry_limit")finish();},5);
  console.error=(...args)=>{output.push(args.join(" "));};
  const timer=setTimeout(()=>finish(),10_000);
  try {
    supervisor.start();await finished;
    assert.equal(output.length,4);
    assert.ok(output.every(line=>line.includes('"phase":"database_schema"')&&line.includes('"code":"28P01"')));
    assert.ok(output.every(line=>!line.includes(secret)));
  } finally {clearTimeout(timer);supervisor.stop();console.error=original;}
});

test("missing child executable reports ENOENT without command/environment disclosure", async () => {
  const original=console.error,output:string[]=[];
  let finish!:()=>void;
  const done=new Promise<void>(resolve=>{finish=resolve;});
  const supervisor=new BetaSupervisor([{component:"gateway",command:"/nonexistent-private-command",args:[],cwd:process.cwd(),env:{}}],state=>{if(state==="retry_limit")finish();},1);
  const timer=setTimeout(()=>finish(),10_000);
  console.error=(...args)=>{output.push(args.join(" "));};
  try {supervisor.start();await done;assert.equal(output.length,4);assert.ok(output.every(s=>s.includes('"code":"ENOENT"')&&!s.includes("private-command")));}
  finally {clearTimeout(timer);supervisor.stop();console.error=original;}
});
