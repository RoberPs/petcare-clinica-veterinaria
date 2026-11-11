import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { parse, stringify } from 'yaml';
import { loadContentFile } from '../../src/content/load';
import * as schema from '../../src/db/schema';
import { testEnv } from '../test-env';

// Acceso directo a la base de datos de pruebas desde Playwright (cargar contenido y consultar mensajes).
let pool: Pool | null = null;

export function testPool(): Pool {
  pool ??= new Pool({ connectionString: testEnv.DATABASE_URL, max: 2 });
  return pool;
}

const testDb = () => drizzle(testPool(), { schema });

export async function migrateTestDb(): Promise<void> {
  await migrate(testDb(), { migrationsFolder: 'drizzle' });
}

export async function loadContent(file: string): Promise<void> {
  await loadContentFile(testDb(), file, { env: { ...process.env, ...testEnv } });
}

export const PETCARE_YAML = 'content/petcare.yaml';

export async function loadPetcare(): Promise<void> {
  await loadContent(PETCARE_YAML);
}

/** Carga una variante de petcare.yaml modificada por `mutate`. Hay que volver a llamar a loadPetcare() después. */
export async function loadPetcareVariant(mutate: (content: Record<string, unknown>) => void): Promise<void> {
  const content = parse(readFileSync(PETCARE_YAML, 'utf8')) as Record<string, unknown>;
  mutate(content);
  const dir = mkdtempSync(join(tmpdir(), 'petcare-e2e-'));
  const file = join(dir, 'variant.yaml');
  writeFileSync(file, stringify(content));
  await loadContent(file);
}

export async function resetContactState(): Promise<void> {
  await testPool().query('TRUNCATE email_outbox, contact_messages, rate_limit_hits CASCADE');
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await testPool().query(sql, params);
  return res.rows as T[];
}
