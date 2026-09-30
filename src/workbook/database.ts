import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
export interface Sql { query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> }
export interface Database extends Sql { transaction<T>(run: (tx: Sql) => Promise<T>): Promise<T>; close(): Promise<void> }
export function postgresDatabase(url: string): Database {
  const pool = new Pool({ connectionString: url, max: 5 });
  return {
    query: async <T>(sql: string, values?: unknown[]) => ({ rows: (await pool.query(sql, values)).rows as T[] }),
    async transaction(run) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await run({ query: async <T>(sql: string, values?: unknown[]) => ({ rows: (await client.query(sql, values)).rows as T[] }) }); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    close: () => pool.end(),
  };
}
export async function migrate(db: Database) {
  const sql = readFileSync(join(process.cwd(), 'migrations/001_workbook.sql'), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  await db.transaction(async tx => {
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL)');
    // Serialize concurrent migration attempts on real Postgres.
    await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const existing = await tx.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE version=1');
    if (existing.rows.length) { if (existing.rows[0].checksum !== checksum) throw new Error('Applied migration checksum changed'); return; }
    // Migration text is a trusted repository file, never request data.
    await tx.query(sql);
    await tx.query('INSERT INTO schema_migrations(version, checksum) VALUES(1,$1)', [checksum]);
  });
}
// Switch privilege context for every app operation, including standalone reads.
export function appDatabase(db: Database): Database {
 return { query: <T>(sql:string,values?:unknown[])=>db.transaction(async tx=>{await tx.query('SET LOCAL ROLE workbook_app');return tx.query<T>(sql,values);}),
 transaction: run=>db.transaction(async tx=>{await tx.query('SET LOCAL ROLE workbook_app');return run(tx);}), close:()=>db.close() };
}
