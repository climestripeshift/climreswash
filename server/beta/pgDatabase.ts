import pg, { type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

// Fixed schema; no user-controlled identifiers or search_path from the connection string.
export class PgDatabase {
  readonly pool: pg.Pool;
  private context = new AsyncLocalStorage<PoolClient>();
  constructor(connectionString: string) {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid beta database URL");
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.searchParams.get("sslmode") !== "verify-full")
      throw new Error("Remote beta PostgreSQL requires verified TLS (sslmode=verify-full)");
    if (url.searchParams.has("options")) throw new Error("Beta database URL must not override isolated schema options");
    this.pool = new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000, options: "-c search_path=bhoomi_beta,pg_catalog -c statement_timeout=10000 -c lock_timeout=5000" });
    this.pool.on("error", () => { /* checked-out operations fail closed; do not log connection secrets */ });
  }
  query(sql: string, args: unknown[] = []) { return (this.context.getStore() ?? this.pool).query(sql, args); }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return fn();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Pilot-sized serial mutation boundary: last-admin changes and quota admission are atomic across replicas.
      await client.query("SELECT pg_advisory_xact_lock(726402316)");
      const value = await this.context.run(client, fn);
      await client.query("COMMIT"); return value;
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }
  prepare(sql: string) {
    let n = 0;
    const statement = sql.replace(/\?/g, () => `$${++n}`);
    return {
      get: async (...args: unknown[]) => (await this.query(statement, args)).rows[0] as Record<string, any> | undefined,
      all: async (...args: unknown[]) => (await this.query(statement, args)).rows as Record<string, any>[],
      run: async (...args: unknown[]) => {
        const needsId = /^INSERT INTO (feedback|audit)\b/.test(statement);
        const r = await this.query(statement + (needsId ? " RETURNING id" : ""), args);
        return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
      },
    };
  }
  async assertReady() {
    const r = await this.query("SELECT version FROM bhoomi_beta.schema_migrations WHERE version=2");
    if (!r.rows.length) throw new Error("Apply beta migrations explicitly before startup");
  }
  close() { return this.pool.end(); }
}
