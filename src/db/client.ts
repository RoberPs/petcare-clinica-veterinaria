import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { requireEnv } from '@/lib/env';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

// Un solo pool por proceso (también en desarrollo, donde Next recarga los módulos).
const globalForDb = globalThis as unknown as { appPool?: Pool; appDb?: Db };

export function getPool(): Pool {
  if (!globalForDb.appPool) {
    globalForDb.appPool = new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 10 });
  }
  return globalForDb.appPool;
}

export function getDb(): Db {
  if (!globalForDb.appDb) globalForDb.appDb = drizzle(getPool(), { schema });
  return globalForDb.appDb;
}

/** Cierra el pool (scripts y pruebas). */
export async function closeDb(): Promise<void> {
  if (globalForDb.appPool) await globalForDb.appPool.end();
  globalForDb.appPool = undefined;
  globalForDb.appDb = undefined;
}
