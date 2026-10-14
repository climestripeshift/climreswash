// In-memory SQL adapter for CPU tests only. No database service is created or connected.
// Production always uses the existing PostgreSQL transaction/advisory-lock implementation.
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import { PostgresBetaStore } from '../../server/beta/pgStore';
import type { PgDatabase } from '../../server/beta/pgDatabase';

export function demoTestStore(now = Date.now) {
  const sql = new DatabaseSync(':memory:');
  for (const name of ['001_beta.sql', '002_access_codes.sql', '004_shared_pin.sql']) {
    const schema = fs.readFileSync('deploy/beta/migrations/' + name, 'utf8')
      .replace(/CREATE SCHEMA[^;]+;/g, '').replace(/SET LOCAL[^;]+;/g, '').replace(/DO \$\$[\s\S]*?END \$\$;/g, '')
      .replace(/ADD COLUMN IF NOT EXISTS/g, 'ADD COLUMN').replace(/BIGSERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/DEFAULT now\(\)/g, 'DEFAULT (unixepoch())');
    sql.exec(schema);
  }
  const context = new AsyncLocalStorage<boolean>(); let tail = Promise.resolve();
  const db = {
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (context.getStore()) return fn();
      const pending = tail; let release!: () => void; tail = new Promise<void>(r => { release = r; }); await pending;
      sql.exec('BEGIN');
      try { const out = await context.run(true, fn); sql.exec('COMMIT'); return out; }
      catch (e) { sql.exec('ROLLBACK'); throw e; } finally { release(); }
    },
    async query(statement: string, args: any[] = []) {
      const text = statement.replace(/\$\d+/g, '?'); const st = sql.prepare(text);
      if (/^\s*SELECT/i.test(text) || /RETURNING/i.test(text)) { const rows = st.all(...args); return { rows, rowCount: rows.length }; }
      return { rows: [], rowCount: Number(st.run(...args).changes) };
    },
    prepare(statement: string) {
      const st = sql.prepare(statement);
      return { async get(...args: any[]) { return st.get(...args); }, async all(...args: any[]) { return st.all(...args); },
        async run(...args: any[]) { const out = st.run(...args); return { changes: Number(out.changes), lastInsertRowid: out.lastInsertRowid }; } };
    },
  };
  return { store: new PostgresBetaStore(db as unknown as PgDatabase, 'local-demo-test-hash-key-'.repeat(2), now), sql };
}
