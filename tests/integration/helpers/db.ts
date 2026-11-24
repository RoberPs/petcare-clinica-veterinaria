import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { parse, stringify } from 'yaml';
import { loadContentFile } from '@/content/load';
import { closeDb, getDb, getPool } from '@/db/client';
import * as fx from '../../account-fixtures';
import * as bfx from '../../booking-fixtures';

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
    TRUNCATE stock_movements, payment_events, payments, order_status_history, order_items, orders, cart_items, carts,
      discount_codes, shipping_methods, product_pet_links, products, product_pets, product_categories, shop_settings,
      admin_audit_log, appointment_events, schedule_blocks, staff_hours,
      appointments, booking_service_staff, booking_services, booking_settings,
      email_outbox, contact_messages, rate_limit_hits, faqs, faq_topics, services, team_members,
      activity_stats, health_notices, contact_reasons, legal_pages, sections, closures, opening_hours, clinic,
      newsletter_unsubscribe_records, newsletter_subscriptions, newsletter_settings, posts, post_categories,
      pets, species, customer_consents, customer_sessions, account_tokens, customers, processed_submissions
    RESTART IDENTITY CASCADE
  `);
  await getPool().query('ALTER SEQUENCE order_number_seq RESTART WITH 1');
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

// ---------- Citas (feature 003) ----------

export { BOOKING_MONDAY_9AM, madrid, type CreateAppointmentOptions, type TestAppointment } from '../../booking-fixtures';

export interface BookingSeed {
  staff: { nerea: string; inigo: string };
  services: { consulta: string; cirugia: string; vacunacion: string };
}

/**
 * Carga petcare.yaml con la variante de reserva (bookingContentVariant): 2 profesionales, 3
 * servicios, horario de lunes a viernes y un cierre. `mutate` permite ajustar las reglas.
 */
export async function seedBookingConfig(mutate?: (content: Record<string, any>) => void): Promise<BookingSeed> {
  const content = parse(readFileSync('content/petcare.yaml', 'utf8')) as Record<string, any>;
  bfx.bookingContentVariant(content);
  mutate?.(content);
  const file = join(mkdtempSync(join(tmpdir(), 'petcare-booking-')), 'booking.yaml');
  writeFileSync(file, stringify(content));
  // --force-booking (F4): cada carga deja la agenda como en el YAML.
  await loadContentFile(getDb(), file, { forceBooking: true });
  const ids = async (sql: string) => new Map((await q<{ slug: string; id: string }>(sql)).map((r) => [r.slug, r.id]));
  const staff = await ids('SELECT slug, id FROM team_members');
  const services = await ids('SELECT slug, id FROM booking_services');
  return {
    staff: { nerea: staff.get('nerea-olmedo')!, inigo: staff.get('inigo-barral')! },
    services: { consulta: services.get('consulta-general')!, cirugia: services.get('cirugia')!, vacunacion: services.get('vacunacion')! },
  };
}

export async function createAppointment(options: bfx.CreateAppointmentOptions): Promise<bfx.TestAppointment> {
  return bfx.createAppointment(getPool(), options);
}

// ---------- Panel de la agenda (feature 007) ----------

export async function createStaffHours(staffSlug: string, slots: { weekday: number; opens: string; closes: string }[]) {
  return bfx.createStaffHours(getPool(), staffSlug, slots);
}

export async function createBlock(options: bfx.CreateBlockOptions): Promise<string> {
  return bfx.createBlock(getPool(), options);
}

/** FormData a partir de un objeto (los valores undefined se omiten). */
export function formData(values: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) if (v !== undefined) f.set(k, v);
  return f;
}
