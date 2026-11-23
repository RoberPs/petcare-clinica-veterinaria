import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { requireEnv } from '@/lib/env';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
/** Transacción abierta con db.transaction(). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Una conexión o una transacción: las consultas que pueden ir dentro de otra transacción aceptan las dos. */
export type DbOrTx = Db | Tx;

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
