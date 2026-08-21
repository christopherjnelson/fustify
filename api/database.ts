import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
const MIGRATION_LOCK_ID = 1_406_117_017;

export interface DatabaseConfiguration {
  connectionString: string;
  maximumConnections?: number;
}

export function createDatabasePool(configuration: DatabaseConfiguration): Pool {
  const options: PoolConfig = {
    connectionString: configuration.connectionString,
    max: configuration.maximumConnections ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  };
  return new Pool(options);
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    create table if not exists fustify_schema_migrations (
      version text primary key,
      applied_at timestamptz not null default statement_timestamp()
    )
  `);
}

export async function runDatabaseMigrations(
  pool: Pool,
  directory = resolve(process.cwd(), 'database/migrations'),
): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await ensureMigrationTable(client);
    const files = (await readdir(directory))
      .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
      .sort();
    const existing = await client.query<{ version: string }>(
      'select version from fustify_schema_migrations',
    );
    const completed = new Set(existing.rows.map((row) => row.version));
    for (const file of files) {
      const version = file.slice(0, -4);
      if (completed.has(version)) continue;
      const sql = await readFile(resolve(directory, file), 'utf8');
      await client.query('begin');
      try {
        await client.query("set local statement_timeout = '30s'");
        await client.query(sql);
        await client.query(
          'insert into fustify_schema_migrations (version) values ($1)',
          [version],
        );
        await client.query('commit');
        applied.push(version);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    client.release();
  }
  return applied;
}
