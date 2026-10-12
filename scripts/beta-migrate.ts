// Explicit operator action; never called by public-app/gateway startup.
import fs from "node:fs/promises";
import { PgDatabase } from "../server/beta/pgDatabase";
async function main() {
if (process.env.BETA_MIGRATIONS_APPROVED !== "1" || !process.env.BETA_DATABASE_URL) throw new Error("Set isolated BETA_DATABASE_URL and explicitly approve beta migrations");
const db = new PgDatabase(process.env.BETA_DATABASE_URL, process.env.BETA_DB_TRANSPORT === "replit-helium" ? "replit-helium" : "tls");
try {
  for (const [version, file] of [[1,"001_beta.sql"],[2,"002_access_codes.sql"],[3,"003_portable_conversations.sql"]] as const) {
    const sql = await fs.readFile(new URL("../deploy/beta/migrations/"+file, import.meta.url), "utf8");
    await db.transaction(async () => {
      const exists = await db.query("SELECT to_regclass('bhoomi_beta.schema_migrations') AS name");
      if (exists.rows[0].name && (await db.query("SELECT 1 FROM bhoomi_beta.schema_migrations WHERE version=$1",[version])).rowCount) return;
      await db.query(sql);
    });
  }
  console.log("Beta schema version 3 ready; public schema unchanged.");
} finally { await db.close(); }
}
main().catch(() => { console.error("Beta operator command failed. Check private configuration, migration state and user permissions; no secret values logged."); process.exitCode=1; });
