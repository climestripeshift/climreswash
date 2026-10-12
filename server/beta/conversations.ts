import { createHmac, randomBytes } from "node:crypto";
import type { PgDatabase } from "./pgDatabase";
export type PortableSession = { id: string; turn_count: number; context: Record<string, unknown>; turns: unknown[] };
export function canonicalJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonicalJson(value[k])).join(",")}}`;
  return JSON.stringify(value);
}
export const coreProof = (body: object,key: string) => createHmac("sha256",key).update("bhoomi-core-v1:"+canonicalJson(body)).digest("hex");
export class ConversationError extends Error { constructor(public code: "invalid" | "busy") { super(code); } }
export class Conversations {
  constructor(private db: PgDatabase, private now=Date.now) {}
  async begin(user: string,id: string | undefined,timeoutMs: number) {
    const sessionId=id??randomBytes(12).toString("hex"),lease=randomBytes(24).toString("hex");
    return this.db.transaction(async()=>{
      if(!id) await this.db.prepare("INSERT INTO conversations(id,user_hash,state_json,updated_at) VALUES(?,?,?,?)")
        .run(sessionId,user,JSON.stringify({id:sessionId,turn_count:0,context:{},turns:[]}),this.now());
      const row=await this.db.prepare("SELECT * FROM conversations WHERE id=? AND user_hash=? FOR UPDATE").get(sessionId,user);
      if(!row || Number(row.updated_at)+3600000<=this.now() || JSON.parse(row.state_json).turn_count>=40)throw new ConversationError("invalid");
      if(Number(row.lease_until)>this.now())throw new ConversationError("busy");
      await this.db.prepare("UPDATE conversations SET lease=?,lease_until=? WHERE id=?").run(lease,this.now()+timeoutMs+60000,sessionId);
      return {id:sessionId,lease,revision:Number(row.revision),state:JSON.parse(row.state_json) as PortableSession};
    });
  }
  async finish(ticket: Awaited<ReturnType<Conversations["begin"]>>,state: PortableSession,write:()=>Promise<void>) {
    if(state.id!==ticket.id || state.turn_count!==ticket.state.turn_count+1 || JSON.stringify(state).length>32000)throw new Error("Invalid portable Core state");
    await this.db.transaction(async()=>{
      const row=await this.db.prepare("SELECT revision,lease,lease_until FROM conversations WHERE id=? FOR UPDATE").get(ticket.id);
      if(!row || row.lease!==ticket.lease || Number(row.revision)!==ticket.revision || Number(row.lease_until)<=this.now())throw new Error("Conversation lease lost");
      await write();
      await this.db.prepare("UPDATE conversations SET state_json=?,revision=revision+1,lease=NULL,lease_until=0,updated_at=? WHERE id=?")
        .run(JSON.stringify(state),this.now(),ticket.id);
    });
  }
  async cancel(ticket: Awaited<ReturnType<Conversations["begin"]>>) {
    await this.db.transaction(async()=>{
      // Failed/denied first turns must not accumulate orphan conversations outside request quotas.
      await this.db.prepare("DELETE FROM conversations WHERE id=? AND lease=? AND revision=0").run(ticket.id,ticket.lease);
      await this.db.prepare("UPDATE conversations SET lease=NULL,lease_until=0 WHERE id=? AND lease=?").run(ticket.id,ticket.lease);
    });
  }
}
