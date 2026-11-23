import { and, count, eq, gt, ne, sql } from 'drizzle-orm';
import { after } from 'next/server';
import { getDb, type DbOrTx } from '@/db/client';
import { recipientHash } from '@/db/queries/contact';
import { clinic, emailOutbox } from '@/db/schema';
import { dispatchById } from './dispatch';
import type { AccountEmailContext } from './templates/account-layout';
import type { OutgoingEmail } from './types';

// Bandeja de salida para los correos ya renderizados (A8): los de cuenta (002), los de cita (003) y
// los de pedido (005).
// Se renderizan al encolarlos y van a la misma tabla que los del contacto.

export type AccountEmailKind = 'verify_email' | 'account_exists' | 'password_reset' | 'password_changed' | 'account_deleted';
export type AppointmentEmailKind =
  | 'appointment_confirmed'
  | 'appointment_changed'
  | 'appointment_cancelled'
  | 'appointment_reminder'
  | 'clinic_appointment';
export type OrderEmailKind = 'order_confirmed' | 'order_received' | 'order_cancelled' | 'clinic_order';
export type NewsletterEmailKind = 'newsletter_confirm';
export type RenderedEmailKind = AccountEmailKind | AppointmentEmailKind | OrderEmailKind | NewsletterEmailKind;

/**
 * Tipos con límite de 3 por dirección y hora (FR-033 de la 002). Solo los de cuenta: los de cita
 * no se limitan aquí, el límite lo pone la reserva (B8, B9).
 */
const LIMITED_KINDS: ReadonlySet<RenderedEmailKind> = new Set(['verify_email', 'account_exists', 'password_reset']);
export const ACCOUNT_EMAILS_PER_HOUR = 3;

export interface EnqueueResult {
  id: string;
  /** false si se ha superado el límite: la fila queda como skipped_rate_limit y no se envía. */
  queued: boolean;
}

export interface EnqueueInput {
  kind: RenderedEmailKind;
  /** Dirección real del destinatario (para el hash del límite). */
  to: string;
  email: OutgoingEmail;
  customerId?: string | null;
  appointmentId?: string | null;
  /** Correos de pedido (feature 005). */
  orderId?: string | null;
}

export async function enqueueEmail(tx: DbOrTx, input: EnqueueInput): Promise<EnqueueResult> {
  const hash = recipientHash(input.to);
  let limited = false;
  if (LIMITED_KINDS.has(input.kind)) {
    // Evita que dos peticiones simultáneas se salten el límite.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.kind}:${hash}`}))`);
    const [recent] = await tx
      .select({ n: count() })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.kind, input.kind),
          eq(emailOutbox.recipientHash, hash),
          ne(emailOutbox.status, 'skipped_rate_limit'),
          gt(emailOutbox.createdAt, sql`now() - interval '1 hour'`),
        ),
      );
    limited = (recent?.n ?? 0) >= ACCOUNT_EMAILS_PER_HOUR;
  }
  const [row] = await tx
    .insert(emailOutbox)
    .values({
      kind: input.kind,
      customerId: input.customerId ?? null,
      appointmentId: input.appointmentId ?? null,
      orderId: input.orderId ?? null,
      recipientHash: hash,
      status: limited ? 'skipped_rate_limit' : 'pending',
      payload: limited
        ? null
        : {
            to: input.email.to,
            subject: input.email.subject,
            html: input.email.html,
            text: input.email.text,
            ...(input.email.headers ? { headers: input.email.headers } : {}),
          },
    })
    .returning({ id: emailOutbox.id });
  return { id: row!.id, queued: !limited };
}

/** Forma de la 002: se conserva para los flujos de cuenta. */
export function enqueueAccountEmail(
  tx: DbOrTx,
  input: { kind: AccountEmailKind; customerId: string | null; to: string; email: OutgoingEmail },
): Promise<EnqueueResult> {
  return enqueueEmail(tx, input);
}

/** Intento inmediato tras responder (after()). Lo que falle queda para email:dispatch. */
export function sendEmailsNow(ids: readonly (string | null | undefined)[]): void {
  const pending = ids.filter((id): id is string => typeof id === 'string');
  if (pending.length > 0) after(() => dispatchById(pending));
}

export const sendAccountEmailsNow = sendEmailsNow;

/**
 * Intento inmediato desde código que también corre fuera de una petición (CLI, tareas programadas,
 * pruebas): dentro de una petición usa after(); fuera, no hace nada y los recoge email:dispatch.
 */
export function sendEmailsSoon(ids: readonly (string | null | undefined)[]): void {
  try {
    sendEmailsNow(ids);
  } catch {
    // Fuera del ámbito de una petición: after() no está disponible.
  }
}

/** Datos de la clínica y de la web que necesitan las plantillas de cuenta. */
export async function getAccountEmailContext(db: DbOrTx = getDb()): Promise<AccountEmailContext> {
  const { clinicName, demoBannerEnabled, siteUrl } = await getEmailContext(db);
  return { clinicName, demoBannerEnabled, siteUrl };
}

/** Contexto de los correos de cita: el de cuenta más la dirección, el teléfono y el buzón de la clínica. */
export interface EmailContext extends AccountEmailContext {
  clinicAddress: string;
  clinicPhone: string;
  inboxEmail: string;
}

export async function getEmailContext(db: DbOrTx = getDb()): Promise<EmailContext> {
  const [c] = await db
    .select({
      name: clinic.name,
      demoBannerEnabled: clinic.demoBannerEnabled,
      addressLine: clinic.addressLine,
      postalCode: clinic.postalCode,
      city: clinic.city,
      phoneDisplay: clinic.phoneDisplay,
      inboxEmail: clinic.inboxEmail,
    })
    .from(clinic)
    .limit(1);
  if (!c) throw new Error('content_not_loaded');
  return {
    clinicName: c.name,
    demoBannerEnabled: c.demoBannerEnabled,
    siteUrl: (process.env.SITE_URL ?? '').replace(/\/$/, ''),
    clinicAddress: `${c.addressLine}, ${c.postalCode} ${c.city}`,
    clinicPhone: c.phoneDisplay,
    inboxEmail: c.inboxEmail,
  };
}
