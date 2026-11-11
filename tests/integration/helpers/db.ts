import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb, getPool } from '@/db/client';
import * as fx from '../../account-fixtures';

export { DEFAULT_PASSWORD, type TestCustomer } from '../../account-fixtures';

// Base de datos de pruebas ("db-test"): se migra una vez y se vacía entre pruebas.
let migrated = false;

export async function setupTestDb() {
  const db = getDb();
  if (!migrated) {
    await migrate(db, { migrationsFolder: 'drizzle' });
    migrated = true;
  }
  return db;
}

export async function truncateAll(): Promise<void> {
  await getPool().query(`
    TRUNCATE email_outbox, contact_messages, rate_limit_hits, faqs, faq_topics, services, team_members,
      activity_stats, health_notices, contact_reasons, legal_pages, sections, closures, opening_hours, clinic,
      pets, species, customer_consents, customer_sessions, account_tokens, customers, processed_submissions
    RESTART IDENTITY CASCADE
  `);
}

export async function teardownTestDb(): Promise<void> {
  await closeDb();
}

// ---------- Cuentas (feature 002) ----------

export async function createCustomer(options: fx.CreateCustomerOptions = {}): Promise<fx.TestCustomer> {
  return fx.createCustomer(getPool(), options);
}

export async function createSessionFor(customerId: string, remember = false, now?: Date): Promise<string> {
  return fx.createSessionFor(getPool(), customerId, remember, now);
}

export async function createPet(customerId: string, options: fx.CreatePetOptions = {}) {
  return fx.createPet(getPool(), customerId, options);
}

export async function resetAccountState(): Promise<void> {
  await fx.resetAccountState(getPool());
}

export async function q<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await getPool().query(sql, params)).rows as T[];
}

/** FormData a partir de un objeto (los valores undefined se omiten). */
export function formData(values: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) if (v !== undefined) f.set(k, v);
  return f;
}
