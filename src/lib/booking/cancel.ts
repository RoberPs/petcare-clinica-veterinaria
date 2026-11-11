import { and, eq, sql } from 'drizzle-orm';
import { isWithinChangeWindow } from '@/domain/appointment-view';
import { getDb, type DbOrTx } from '@/db/client';
import { findAppointmentForUpdate, upcomingIds } from '@/db/queries/appointments';
import { loadBookingConfig } from '@/db/queries/booking-config';
import { appointments } from '@/db/schema';
import { getEmailContext, type EmailContext } from '@/email/outbox';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { enqueueCancelEmails } from './emails';

// Cancelar una cita (B10, B13, FR-025): la pasa a "cancelled", incrementa manage_version (el enlace
// de gestión anterior deja de valer) y encola los correos en la misma transacción. La franja queda
// libre en el acto: la restricción de exclusión solo mira las confirmadas.

export type Actor = 'customer' | 'clinic' | 'system';

export type CancelResult =
  | { status: 'ok'; appointmentId: string; emailIds: string[] }
  | { status: 'not_found' }
  | { status: 'out_of_window' }
  /** Ya cancelada o ya empezada: aviso "cita-no-disponible". */
  | { status: 'already_cancelled' }
  | { status: 'error' };

export interface CancelOptions {
  /** Aplica el plazo de cambio (solo el cliente). */
  enforceCutoff: boolean;
  cutoffHours: number;
  emailCtx: EmailContext;
  /** Si se pasa, la cita tiene que ser de ese cliente (A9); si no, not_found. */
  customerId?: string;
  /** false: sin correo al responsable (eliminar una mascota). */
  notifyOwner?: boolean;
  /** Enlace de gestión (B7): solo vale si la cita sigue en esta versión; si no, not_found. */
  expectedVersion?: number;
}

export async function cancelAppointment(
  tx: DbOrTx,
  id: string,
  actor: Actor,
  now: Date,
  options: CancelOptions,
): Promise<CancelResult> {
  const row = await findAppointmentForUpdate(tx, id);
  if (!row || (options.customerId !== undefined && row.customerId !== options.customerId))
    return { status: 'not_found' };
  if (options.expectedVersion !== undefined && row.manageVersion !== options.expectedVersion) return { status: 'not_found' };
  if (row.status === 'cancelled' || row.startsAt.getTime() <= now.getTime())
    return { status: 'already_cancelled' };
  if (options.enforceCutoff && !isWithinChangeWindow(row.startsAt, now, options.cutoffHours))
    return { status: 'out_of_window' };

  const [updated] = await tx
    .update(appointments)
    .set({
      status: 'cancelled',
      cancelledBy: actor,
      cancelledAt: now,
      manageVersion: sql`${appointments.manageVersion} + 1`,
      updatedAt: now,
    })
    .where(and(eq(appointments.id, id), eq(appointments.status, 'confirmed')))
    .returning();
  if (!updated) return { status: 'already_cancelled' };
  const emailIds = await enqueueCancelEmails(tx, updated, actor, options.emailCtx, {
    notifyOwner: options.notifyOwner,
  });
  return { status: 'ok', appointmentId: id, emailIds };
}

/** El cliente cancela una cita suya desde "Mis citas" (US4), con el plazo. */
export async function cancelOwn(customerId: string, id: string, ctx: { now: Date }): Promise<CancelResult> {
  try {
    const config = await loadBookingConfig();
    if (!config) return { status: 'error' };
    const emailCtx = await getEmailContext();
    const result = await getDb().transaction((tx) =>
      cancelAppointment(tx, id, 'customer', ctx.now, {
        enforceCutoff: true,
        cutoffHours: config.rules.changeCutoffHours,
        emailCtx,
        customerId,
      }),
    );
    if (result.status === 'not_found') {
      logger.warn({ customer_id: customerId, code: 'not_found' }, 'appointment_access_denied');
    } else {
      logger.info(
        { customer_id: customerId, appointment_id: id.slice(0, 64), code: result.status },
        'appointment_cancel',
      );
    }
    return result;
  } catch (error) {
    logger.error({ customer_id: customerId, code: errorCode(error) }, 'appointment_cancel_failed');
    return { status: 'error' };
  }
}

/**
 * Citas futuras de un cliente (o solo de una mascota) canceladas dentro de una transacción ajena:
 * al eliminar la cuenta (`system`, sin correo al cliente) o una mascota (`customer`, solo a la
 * clínica). Devuelve los ids de los correos.
 */
export async function cancelUpcomingFor(
  tx: DbOrTx,
  customerId: string,
  now: Date,
  options: { actor: 'customer' | 'system'; petId?: string; emailCtx?: EmailContext },
): Promise<string[]> {
  const ids = await upcomingIds(tx, customerId, now, options.petId);
  if (ids.length === 0) return [];
  const emailCtx = options.emailCtx ?? (await getEmailContext(tx));
  const emailIds: string[] = [];
  for (const id of ids) {
    const r = await cancelAppointment(tx, id, options.actor, now, {
      enforceCutoff: false,
      cutoffHours: 0,
      emailCtx,
      customerId,
      notifyOwner: false,
    });
    if (r.status === 'ok') emailIds.push(...r.emailIds);
  }
  return emailIds;
}

/** Eliminar la cuenta (B12): cancela las futuras como "system". */
export function cancelForSystem(tx: DbOrTx, customerId: string, now: Date): Promise<string[]> {
  return cancelUpcomingFor(tx, customerId, now, { actor: 'system' });
}

/** Anonimiza todas las citas de un cliente (B12): sin datos de contacto ni motivo. */
export async function anonymizeCustomerAppointments(
  tx: DbOrTx,
  customerId: string,
  now: Date,
): Promise<number> {
  const rows = await tx
    .update(appointments)
    .set({
      contactName: null,
      contactEmail: null,
      contactEmailNormalized: null,
      contactPhone: null,
      reason: null,
      anonymizedAt: now,
      updatedAt: now,
    })
    .where(and(eq(appointments.customerId, customerId), sql`${appointments.anonymizedAt} is null`))
    .returning({ id: appointments.id });
  return rows.length;
}
