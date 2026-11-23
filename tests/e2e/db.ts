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
import * as fx from '../account-fixtures';
import * as bfx from '../booking-fixtures';

export { DEFAULT_PASSWORD, type TestCustomer } from '../account-fixtures';

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

/**
 * Las pruebas cargan con --force-booking (F4): cada carga deja servicios, equipo, horarios por
 * veterinario y bloqueos como en el YAML, aunque otra prueba los haya cambiado desde el panel.
 */
export async function loadContent(file: string): Promise<void> {
  await loadContentFile(testDb(), file, { env: { ...process.env, ...testEnv }, forceBooking: true });
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

// ---------- Cuentas (feature 002) ----------

export const createCustomer = (options: fx.CreateCustomerOptions = {}) => fx.createCustomer(testPool(), options);
export const createSessionFor = (customerId: string, remember = false, now?: Date) =>
  fx.createSessionFor(testPool(), customerId, remember, now);
export const createPet = (customerId: string, options: fx.CreatePetOptions = {}) => fx.createPet(testPool(), customerId, options);
export const resetAccountState = () => fx.resetAccountState(testPool());

// ---------- Citas (feature 003) ----------

export { BOOKING_MONDAY_9AM, madrid } from '../booking-fixtures';
export const createAppointmentInDb = (options: bfx.CreateAppointmentOptions) => bfx.createAppointment(testPool(), options);

// ---------- Panel de la agenda (feature 007) ----------

export const createStaffHours = (staffSlug: string, slots: { weekday: number; opens: string; closes: string }[]) =>
  bfx.createStaffHours(testPool(), staffSlug, slots);
export const createBlock = (options: bfx.CreateBlockOptions) => bfx.createBlock(testPool(), options);

/** Vacía las citas, los intentos y la bandeja de salida (el contenido se conserva). */
export async function resetBookingState(): Promise<void> {
  await testPool().query('TRUNCATE appointments, rate_limit_hits, email_outbox CASCADE');
}

// ---------- Carrito y pago (feature 005) ----------

/** Prefijos de la península (sin Baleares 07, Las Palmas 35 ni Santa Cruz 38). */
export const PENINSULA_PREFIXES = Array.from({ length: 50 }, (_, i) => String(i + 1).padStart(2, '0')).filter(
  (p) => !['07', '35', '38'].includes(p),
);

/** petcare.yaml con el envío a domicilio solo a la península (US4). Hay que volver a llamar a loadPetcare() después. */
export async function loadPetcarePeninsula(): Promise<void> {
  await loadPetcareVariant((content) => {
    const checkout = content.checkout as { shipping_methods: { kind: string; postal_prefixes?: string[] | null }[] };
    checkout.shipping_methods.find((m) => m.kind === 'home_delivery')!.postal_prefixes = PENINSULA_PREFIXES;
  });
}

/** Vacía carritos, pedidos, pagos y la bandeja de salida (el contenido se conserva; uses_count vuelve a 0). */
export async function resetShopState(): Promise<void> {
  await testPool().query(
    'TRUNCATE payment_events, payments, order_status_history, order_items, orders, cart_items, carts, rate_limit_hits, email_outbox CASCADE',
  );
  await testPool().query('UPDATE discount_codes SET uses_count = 0');
}

export interface InsertOrderOptions {
  number: string;
  customerId?: string | null;
  email?: string;
  status?: 'pending_payment' | 'paid' | 'shipped' | 'delivered';
  paymentMethod?: 'card' | 'in_clinic';
  slug?: string;
  quantity?: number;
  /** Minutos antes de ahora en que se hizo el pedido. */
  minutesAgo?: number;
}

/** Inserta un pedido de envío a domicilio con una línea, directamente en la base (e2e de "Mis pedidos"). */
export async function insertOrder(o: InsertOrderOptions): Promise<string> {
  const [p] = await query<{ id: string; name: string; slug: string; price_cents: number; vat_rate: number }>(
    'SELECT id, name, slug, price_cents, vat_rate FROM products WHERE slug = $1',
    [o.slug ?? 'pienso-perro-adulto'],
  );
  const qty = o.quantity ?? 1;
  const total = p!.price_cents * qty;
  const vat = Math.round(total - total / (1 + p!.vat_rate / 100));
  const status = o.status ?? 'paid';
  const pending = status === 'pending_payment';
  const email = o.email ?? 'cliente-pedidos@example.test';
  const [row] = await query<{ id: string }>(
    `INSERT INTO orders (number, submission_id, customer_id, checkout_fingerprint, contact_email, contact_email_normalized,
       first_name, last_name, address_line, postal_code, city, shipping_method_code, shipping_name, shipping_kind,
       shipping_cost_cents, shipping_vat_rate, payment_method, subtotal_cents, total_cents, vat_cents, status,
       reservation_status, reservation_expires_at, paid_at, created_at, last_status_at)
     VALUES ($1, gen_random_uuid(), $2, 'e2e', $3, lower($3), 'Lucía', 'Prueba', 'Calle de la Prueba 3', '28001', 'Madrid',
       'domicilio', 'Envío a domicilio', 'home_delivery', 0, 21, $4, $5, $5, $6, $7,
       $8, $9, $10, now() - make_interval(mins => $11), now() - make_interval(mins => $11))
     RETURNING id`,
    [
      o.number,
      o.customerId ?? null,
      email,
      o.paymentMethod ?? 'card',
      total,
      vat,
      status,
      pending ? 'held' : 'committed',
      pending ? new Date(Date.now() + 25 * 60_000) : null,
      pending ? null : new Date(),
      o.minutesAgo ?? 0,
    ],
  );
  await query(
    `INSERT INTO order_items (order_id, product_id, product_name, product_slug, unit_price_cents, vat_rate, quantity, line_total_cents, vat_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [row!.id, p!.id, p!.name, p!.slug, p!.price_cents, p!.vat_rate, qty, total, vat],
  );
  await query(`INSERT INTO order_status_history (order_id, from_status, to_status, actor, created_at) VALUES ($1, NULL, 'pending_payment', 'customer', now() - make_interval(mins => $2))`, [row!.id, o.minutesAgo ?? 0]);
  if (!pending) {
    await query(`INSERT INTO order_status_history (order_id, from_status, to_status, actor) VALUES ($1, 'pending_payment', $2, 'gateway')`, [row!.id, status === 'paid' ? 'paid' : status]);
  }
  return row!.id;
}
