// Never forward child output or exception messages. Only these fixed tokens may enter public-app logs.
export const STARTUP_PHASES = [
  "configuration", "database_schema", "database_role", "pin_schema",
  "authentication", "approval_manifest", "listener", "ready",
] as const;
export type StartupPhase = typeof STARTUP_PHASES[number];
const codes = [
  "ENOENT", "EACCES", "ENOMEM", "EADDRINUSE", "ECONNREFUSED", "ECONNRESET",
  "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND",
  "ERR_UNKNOWN_BUILTIN_MODULE", "ERR_DLOPEN_FAILED", "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID", "28P01", "28000", "3D000", "42P01", "42501",
  "53300", "57P01", "08001", "SYNTAX_ERROR", "NODE_HEAP_EXHAUSTED", "ERR_INVALID_URL",
  "BETA_SCHEMA_NOT_READY", "PIN_SCHEMA_NOT_READY", "BETA_ROLE_PRIVILEGED", "BETA_ROLE_NOT_ISOLATED",
  "BETA_ORIGIN_INVALID", "BETA_AUTH_INVALID", "BETA_INGRESS_INVALID", "BETA_DB_TLS_REQUIRED",
  "BETA_DB_TRANSPORT_INVALID", "BETA_LIMIT_INVALID", "STARTUP_FAILURE",
] as const;
export type StartupCode = typeof codes[number];
export const safeStartupCode = (code: unknown): StartupCode =>
  typeof code === "string" && (codes as readonly string[]).includes(code) ? code as StartupCode : "STARTUP_FAILURE";

export function startupCode(error: unknown): StartupCode {
  if (error instanceof SyntaxError) return "SYNTAX_ERROR";
  if(error instanceof Error) {
    const known: Record<string,StartupCode> = {
      "Apply beta migrations explicitly before startup":"BETA_SCHEMA_NOT_READY",
      "Apply shared PIN migration before gateway startup":"PIN_SCHEMA_NOT_READY",
      "Beta requires an unprivileged database role":"BETA_ROLE_PRIVILEGED",
      "Beta role must not own the schema, inherit roles or access public-site tables":"BETA_ROLE_NOT_ISOLATED",
      "BETA_PUBLIC_ORIGIN must be an HTTPS origin":"BETA_ORIGIN_INVALID",
      "Unsupported beta authentication provider":"BETA_AUTH_INVALID",
      "Access-code login requires proxy ingress and isolated PostgreSQL configuration":"BETA_AUTH_INVALID",
      "Invalid BETA_INGRESS_MODE":"BETA_INGRESS_INVALID",
      "Worker ingress requires BETA_ORIGIN_KEY":"BETA_INGRESS_INVALID",
      "Remote beta PostgreSQL requires verified TLS (sslmode=verify-full)":"BETA_DB_TLS_REQUIRED",
      "Helium transport is restricted to the app-internal helium/heliumdb endpoint":"BETA_DB_TRANSPORT_INVALID",
      "Beta timeout/concurrency exceeds validated limits":"BETA_LIMIT_INVALID",
    };
    if(Object.prototype.hasOwnProperty.call(known,error.message))return known[error.message];
  }
  return safeStartupCode(error && typeof error === "object" ? (error as { code?: unknown }).code : undefined);
}

export function startupEvent(phase: StartupPhase, error?: unknown) {
  console.error("[beta-startup] " + JSON.stringify({ phase, ...(error === undefined ? {} : { code: startupCode(error) }) }));
}

// Child stderr may contain secrets, paths or a stack trace. Retain bounded text only in memory,
// classify it, then discard it. Never emit it or copy fields that are not allowlisted.
export class StartupOutput {
  phase?: StartupPhase;
  code?: StartupCode;
  private pending = "";
  private tail = "";
  consume(chunk: string) {
    const text = chunk.slice(-8192);
    this.tail = (this.tail + text).slice(-8192);
    this.pending = (this.pending + text).slice(-8192);
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("[beta-startup] ")) continue;
      try {
        const event = JSON.parse(line.slice("[beta-startup] ".length));
        if ((STARTUP_PHASES as readonly unknown[]).includes(event.phase)) this.phase = event.phase;
        if (event.code !== undefined) this.code = safeStartupCode(event.code);
      } catch { /* untrusted output is not logged */ }
    }
  }
  classifiedCode(): StartupCode | undefined {
    if (this.code) return this.code;
    if (/FATAL ERROR[^\n]*(?:heap out of memory|Allocation failed)/i.test(this.tail)) return "NODE_HEAP_EXHAUSTED";
    return codes.find(code => code !== "STARTUP_FAILURE" && new RegExp("\\b" + code + "\\b").test(this.tail));
  }
}
