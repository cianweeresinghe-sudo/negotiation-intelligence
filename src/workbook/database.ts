import { readFileSync, readdirSync } from 'node:fs';
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
export async function migrate(db: Database, directory=join(process.cwd(), 'migrations')) {
  const migrations=readdirSync(directory).filter(name=>name.endsWith('.sql')).map(name=>{
    const match=/^(\d+)_[-a-zA-Z0-9_]+\.sql$/.exec(name);
    if(!match)throw new Error('Invalid migration filename');
    const version=Number(match[1]);
    if(!Number.isSafeInteger(version)||version<1||version>2147483647)throw new Error('Invalid migration version');
    const sql=readFileSync(join(directory,name),'utf8');
    return {version,sql,checksum:createHash('sha256').update(sql).digest('hex')};
  }).sort((a,b)=>a.version-b.version);
  if(new Set(migrations.map(m=>m.version)).size!==migrations.length)throw new Error('Duplicate migration version');
  await db.transaction(async tx => {
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL)');
    await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const applied=(await tx.query<{version:number;checksum:string}>('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
    for(const row of applied){
      const file=migrations.find(m=>m.version===row.version);
      if(!file||file.checksum!==row.checksum)throw new Error('Applied migration missing or checksum changed');
    }
    const last=applied.at(-1)?.version??0;
    for(const migration of migrations){
      if(applied.some(row=>row.version===migration.version))continue;
      if(migration.version<last)throw new Error('Migration inserted before applied version');
      // Migration text is a trusted repository file, never request data.
      await tx.query(migration.sql);
      await tx.query('INSERT INTO schema_migrations(version, checksum) VALUES($1,$2)',[migration.version,migration.checksum]);
    }
  });
}
// Switch privilege context for every app operation, including standalone reads.
export function appDatabase(db: Database): Database {
 return { query: <T>(sql:string,values?:unknown[])=>db.transaction(async tx=>{await tx.query('SET LOCAL ROLE workbook_app');return tx.query<T>(sql,values);}),
 transaction: run=>db.transaction(async tx=>{await tx.query('SET LOCAL ROLE workbook_app');return run(tx);}), close:()=>db.close() };
}
