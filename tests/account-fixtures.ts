import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { hashPassword } from '../src/lib/auth/password';

// Fixtures de cuentas para las pruebas de integración y de extremo a extremo: crean clientes
// verificados, sesiones y mascotas directamente en la base de datos (sin pasar por la interfaz).

export const DEFAULT_PASSWORD = 'caballo bateria grapa';

export interface TestCustomer {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface CreateCustomerOptions {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  verified?: boolean;
  phone?: string | null;
  marketingOptIn?: boolean;
  createdAt?: Date;
}

let counter = 0;

export async function createCustomer(pool: Pool, options: CreateCustomerOptions = {}): Promise<TestCustomer> {
  counter += 1;
  const email = options.email ?? `cliente-${Date.now()}-${counter}@example.test`;
  const password = options.password ?? DEFAULT_PASSWORD;
  const firstName = options.firstName ?? 'Cliente';
  const lastName = options.lastName ?? 'De Pruebas';
  const verified = options.verified ?? true;
  const createdAt = options.createdAt ?? new Date();
  const { rows } = await pool.query(
    `INSERT INTO customers (email, email_normalized, first_name, last_name, phone, password_hash, email_verified_at,
       marketing_opt_in, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id`,
    [
      email,
      email.trim().toLowerCase(),
      firstName,
      lastName,
      options.phone ?? null,
      await hashPassword(password),
      verified ? createdAt : null,
      options.marketingOptIn ?? false,
      createdAt,
    ],
  );
  await pool.query(
    `INSERT INTO customer_consents (customer_id, kind, privacy_version, terms_version, created_at)
     VALUES ($1, 'privacy_terms', '2026-11-11', '2026-11-10', $2)`,
    [rows[0].id, createdAt],
  );
  return { id: rows[0].id, email, password, firstName, lastName };
}

/** Crea una sesión vigente y devuelve el valor de la cookie pc_session. */
export async function createSessionFor(
  pool: Pool,
  customerId: string,
  remember = false,
  now: Date = new Date(),
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(now.getTime() + (remember ? 30 * 24 : 12) * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO customer_sessions (token_hash, customer_id, remember, created_at, last_seen_at, expires_at)
     VALUES ($1, $2, $3, $4, $4, $5)`,
    [tokenHash, customerId, remember, now, expiresAt],
  );
  return token;
}

export interface CreatePetOptions {
  name?: string;
  speciesKey?: string | null;
  birthDate?: string;
}

export async function createPet(pool: Pool, customerId: string, options: CreatePetOptions = {}): Promise<{ id: string; name: string }> {
  const name = options.name ?? `Mascota ${randomUUID().slice(0, 6)}`;
  const { rows } = await pool.query(
    `INSERT INTO pets (customer_id, name, species_key, birth_date) VALUES ($1, $2, $3, $4) RETURNING id`,
    [customerId, name, options.speciesKey === undefined ? 'perro' : options.speciesKey, options.birthDate ?? '2022-08-01'],
  );
  return { id: rows[0].id, name };
}

/** Vacía las tablas de cuentas, los intentos y la bandeja de salida (el contenido se conserva). */
export async function resetAccountState(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE pets, customer_consents, customer_sessions, account_tokens, processed_submissions, customers,
       rate_limit_hits, email_outbox CASCADE`,
  );
}
