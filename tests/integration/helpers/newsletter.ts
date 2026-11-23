import { createSubmissionToken } from '@/lib/form-token';
import { newConfirmToken } from '@/lib/newsletter/tokens';
import { formData, q } from './db';

// Utilidades de las pruebas de integración del boletín (feature 006).

/** Hora de la acción: el token del formulario exige 3 s (R6). */
export const later = (ms = 5_000) => new Date(Date.now() + ms);

let ipCounter = 0;
export const freshIp = () => `203.0.113.${(ipCounter = (ipCounter + 1) % 250)}`;

export function subscribeForm(overrides: Record<string, string | undefined> = {}): FormData {
  return formData({
    email: 'lector@example.test',
    accept_policy: 'on',
    return_to: '/',
    submission_token: createSubmissionToken(),
    ...overrides,
  });
}

export interface SubscriptionSeed {
  email?: string;
  status?: 'pending' | 'confirmed';
  source?: 'form' | 'account';
  customerId?: string | null;
  createdAt?: Date;
  confirmSentAt?: Date | null;
  /** Caducidad del token de confirmación (por defecto, dentro de 7 días). */
  expiresAt?: Date;
}

/** Crea una suscripción en el estado pedido y devuelve su id y el token de confirmación en claro. */
export async function createSubscription(seed: SubscriptionSeed = {}): Promise<{ id: string; token: string }> {
  const now = new Date();
  const status = seed.status ?? 'pending';
  const token = newConfirmToken(now);
  const [row] = await q<{ id: string }>(
    `INSERT INTO newsletter_subscriptions
       (email, status, source, customer_id, policy_version, created_at, confirmed_at, confirm_token_hash, confirm_expires_at, confirm_sent_at)
     VALUES ($1, $2, $3, $4, '1.0', $5, $6, $7, $8, $9) RETURNING id`,
    [
      seed.email ?? 'lector@example.test',
      status,
      seed.source ?? 'form',
      seed.customerId ?? null,
      seed.createdAt ?? now,
      status === 'confirmed' ? now : null,
      token.hash,
      seed.expiresAt ?? token.expiresAt,
      seed.confirmSentAt === undefined ? now : seed.confirmSentAt,
    ],
  );
  return { id: row!.id, token: token.token };
}

export interface OutboxEmail {
  subject: string;
  text: string;
  html: string;
  to: { email: string };
  headers?: Record<string, string>;
}

/** Correos newsletter_confirm de la bandeja, del más antiguo al más reciente. */
export async function confirmEmails(): Promise<OutboxEmail[]> {
  const rows = await q<{ payload: OutboxEmail }>(
    `SELECT payload FROM email_outbox WHERE kind = 'newsletter_confirm' ORDER BY created_at, id`,
  );
  return rows.map((r) => r.payload);
}

/** Último correo de confirmación de la bandeja (o null). */
export async function lastConfirmEmail(): Promise<OutboxEmail | null> {
  const all = await confirmEmails();
  return all.at(-1) ?? null;
}

/** Token de confirmación (?t=) del enlace del correo. */
export function confirmTokenFrom(email: OutboxEmail): string {
  const m = email.text.match(/\/boletin\/confirmar\?t=([^\s]+)/);
  if (!m) throw new Error('sin enlace de confirmación');
  return decodeURIComponent(m[1]!);
}

/** Token de baja (?t=) del enlace del pie del correo. */
export function unsubscribeTokenFrom(email: OutboxEmail): string {
  const m = email.text.match(/\/boletin\/baja\?t=([^\s]+)/);
  if (!m) throw new Error('sin enlace de baja');
  return decodeURIComponent(m[1]!);
}

export const subscriptions = () =>
  q(`SELECT id, email, status, source, customer_id, confirmed_at, confirm_sent_at FROM newsletter_subscriptions ORDER BY created_at`);

export const unsubscribeRecords = () =>
  q(`SELECT email_hmac, source, policy_version, subscribed_at, confirmed_at, unsubscribed_at, reason FROM newsletter_unsubscribe_records ORDER BY unsubscribed_at`);
