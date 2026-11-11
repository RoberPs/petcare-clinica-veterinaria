import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb, getPool } from '@/db/client';

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
      activity_stats, health_notices, contact_reasons, legal_pages, sections, closures, opening_hours, clinic
    RESTART IDENTITY CASCADE
  `);
}

export async function teardownTestDb(): Promise<void> {
  await closeDb();
}
