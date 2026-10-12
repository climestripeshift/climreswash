// Run on the beta host with its secret environment. No token/key is accepted as a command-line argument.
import fs from "node:fs/promises";
import path from "node:path";
import { generateAccessCode, hashAccessCode } from "../server/beta/accessCodes";
import { PgDatabase } from "../server/beta/pgDatabase";
import { PostgresBetaStore } from "../server/beta/pgStore";
async function main() {
const [action, email, value] = process.argv.slice(2);
if ((!process.env.BETA_DATABASE_URL && !process.env.BETA_DB_PATH) || !process.env.BETA_HASH_KEY) throw new Error("Configure BETA_DB_PATH and BETA_HASH_KEY in the host secret environment");
const store = process.env.BETA_DATABASE_URL
  ? new PostgresBetaStore(new PgDatabase(process.env.BETA_DATABASE_URL), process.env.BETA_HASH_KEY)
  : new (await import("../server/beta/store")).BetaStore(process.env.BETA_DB_PATH!, process.env.BETA_HASH_KEY);
if (store instanceof PostgresBetaStore) await store.db.assertReady();
const actor = process.env.BETA_OPERATOR_ID;
if (!actor) throw new Error("BETA_OPERATOR_ID is required for audit attribution");
try {
  switch (action) {
    case "invite":
    case "issue-code": {
      if (!(store instanceof PostgresBetaStore)) {
        if (action === "issue-code") throw new Error("Access codes require PostgreSQL");
        await store.invite(email,value === "admin" ? "admin" : "user",actor); break;
      }
      const output = process.env.BETA_INVITATION_FILE;
      if (!output || !path.isAbsolute(output)) throw new Error("Set BETA_INVITATION_FILE to a new private absolute path outside the repository");
      const parent = await fs.realpath(path.dirname(output)), root = await fs.realpath(new URL("../", import.meta.url));
      if (parent === root || parent.startsWith(root + path.sep)) throw new Error("Invitation files must stay outside the repository");
      const file = await fs.open(path.join(parent,path.basename(output)), "wx", 0o600);
      try {
        const code = generateAccessCode(), encoded = await hashAccessCode(code);
        await store.db.transaction(async () => {
          if (action === "invite") await store.invite(email,value === "admin" ? "admin" : "user",actor);
          await store.setAccessCodeHash(email,encoded,actor);
        });
        await file.writeFile(`Bhoomi AI private research beta\nURL: https://climreswash.in/bhoomiai\nEmail: ${email.trim().toLowerCase()}\nPrivate access code: ${code}\nKeep this code private. It is not an email verification code.\n`);
        console.log("Private login details saved to BETA_INVITATION_FILE with owner-only permissions. No code printed.");
      } catch (e) { await fs.unlink(output); throw e; }
      finally { await file.close(); }
      break;
    }
    case "revoke": await store.manageUser(email, { status: "suspended" }, actor); break;
    case "restore": await store.manageUser(email, { status: "active" }, actor); break;
    case "role": await store.manageUser(email, { role: value as "admin" | "user" }, actor); break;
    case "quota": await store.manageUser(email, { quota: Number(value) }, actor); break;
    case "list": console.log(JSON.stringify(await store.listUsers(), null, 2)); break;
    case "pause": await store.setSetting("paused", "true"); await store.audit(store.hash(actor), "cli_pause"); break;
    case "resume": await store.setSetting("paused", "false"); await store.audit(store.hash(actor), "cli_resume"); break;
    default: throw new Error("Usage: beta-admin.ts invite EMAIL [user|admin] | issue-code EMAIL | revoke EMAIL | restore EMAIL | role EMAIL ROLE | quota EMAIL N | list | pause | resume");
  }
  if (action !== "list") console.log("Saved in configured beta database; no email sent and no provider policy changed.");
} finally { await store.close(); }
}
main().catch(() => { console.error("Beta operator command failed. Check private configuration, migration state and user permissions; no secret values logged."); process.exitCode=1; });
