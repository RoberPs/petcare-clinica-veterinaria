import { and, eq, sql } from 'drizzle-orm';
import { isWithinChangeWindow } from '@/domain/appointment-view';
import { assignStaff } from '@/domain/assign-staff';
import { availableSlots, localDateTime } from '@/domain/availability';
import type { FieldErrors } from '@/domain/account-schemas';
import { getDb } from '@/db/client';
import {
  busyIntervalsForDay,
  dayLoad,
  findAppointment,
  findAppointmentForUpdate,
} from '@/db/queries/appointments';
import { loadBookingConfig } from '@/db/queries/booking-config';
import { appointments } from '@/db/schema';
import { getEmailContext } from '@/email/outbox';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import type { Actor } from './cancel';
import { resolveSlotChoice } from './book';
import { enqueueChangeEmails } from './emails';
import { withDayLocks } from './transaction';

// Cambiar una cita (B13, FR-024): la misma fila pasa a otro profesional, inicio y fin del mismo
// servicio. Bloquea el día antiguo y el nuevo (en orden), recalcula la disponibilidad sin contar la
// propia cita y actualiza en un solo UPDATE: la franja antigua queda libre y la nueva ocupada a la
// vez. manage_version + 1 y reminder_sent_at a NULL (el recordatorio se vuelve a programar, B17).

export type RescheduleResult =
  | { status: 'ok'; appointmentId: string; emailIds: string[]; changed: boolean; manageVersion: number }
  | { status: 'invalid'; fieldErrors: FieldErrors }
  | { status: 'slot_taken' }
  | { status: 'not_found' }
  | { status: 'out_of_window' }
  | { status: 'already_cancelled' }
  | { status: 'error' };

export interface RescheduleOptions {
  now: Date;
  enforceCutoff: boolean;
  /** Si se pasa, la cita tiene que ser de ese cliente (A9). */
  customerId?: string;
  /** Enlace de gestión (B7): solo vale si la cita sigue en esta versión; si no, not_found. */
  expectedVersion?: number;
}

/** `input`: fecha, profesional ("sin-preferencia" o slug) y hora, tal como llegan del formulario. */
export async function rescheduleAppointment(
  id: string,
  input: Record<string, string>,
  actor: Exclude<Actor, 'system'>,
  options: RescheduleOptions,
): Promise<RescheduleResult> {
  const { now } = options;
  const config = await loadBookingConfig();
  if (!config) return { status: 'error' };
  const current = await findAppointment(id);
  if (!current || (options.customerId !== undefined && current.customerId !== options.customerId))
    return { status: 'not_found' };
  const service = config.services.find((s) => s.id === current.bookingServiceId);
  // El servicio ya no se ofrece: no se puede cambiar por la web (se mantiene la cita, B15).
  if (!service)
    return {
      status: 'invalid',
      fieldErrors: { hora: 'Este servicio ya no se puede cambiar por la web. Llama a la clínica.' },
    };

  const choice = resolveSlotChoice(input, config, now, service);
  if (!choice.ok) return { status: 'invalid', fieldErrors: choice.fieldErrors };
  const { staff, date, time } = choice.choice;
  const oldDate = localDateTime(current.startsAt).date;
  const emailCtx = await getEmailContext();

  const outcome = await withDayLocks(getDb(), [oldDate, date], async (tx): Promise<RescheduleResult> => {
    const row = await findAppointmentForUpdate(tx, id);
    if (!row || (options.customerId !== undefined && row.customerId !== options.customerId))
      return { status: 'not_found' };
    if (options.expectedVersion !== undefined && row.manageVersion !== options.expectedVersion) return { status: 'not_found' };
    if (row.status === 'cancelled' || row.startsAt.getTime() <= now.getTime())
      return { status: 'already_cancelled' };
    if (options.enforceCutoff && !isWithinChangeWindow(row.startsAt, now, config.rules.changeCutoffHours)) {
      return { status: 'out_of_window' };
    }

    const busy = await busyIntervalsForDay(tx, date, { excludeId: id });
    const free = availableSlots({ ...config, date, service, staffId: staff?.id ?? null, busy, now }).find(
      (s) => s.time === time,
    );
    if (!free) return { status: 'slot_taken' };

    // La misma hora: sin cambios y sin correo (contracts/forms.md).
    const sameStaff =
      staff === null ? free.freeStaffIds.includes(row.teamMemberId) : staff.id === row.teamMemberId;
    if (free.startsAt.getTime() === row.startsAt.getTime() && sameStaff) {
      return {
        status: 'ok',
        appointmentId: id,
        emailIds: [],
        changed: false,
        manageVersion: row.manageVersion,
      };
    }

    const teamMemberId =
      staff?.id ??
      assignStaff(
        free.freeStaffIds,
        await dayLoad(tx, date, id),
        config.staff.map((m) => m.id),
      );
    if (!teamMemberId) return { status: 'slot_taken' };
    const [updated] = await tx
      .update(appointments)
      .set({
        teamMemberId,
        startsAt: free.startsAt,
        endsAt: free.endsAt,
        manageVersion: sql`${appointments.manageVersion} + 1`,
        reminderSentAt: null,
        updatedAt: now,
      })
      .where(and(eq(appointments.id, id), eq(appointments.status, 'confirmed')))
      .returning();
    if (!updated) return { status: 'already_cancelled' };
    const emailIds = await enqueueChangeEmails(
      tx,
      updated,
      row.startsAt,
      emailCtx,
      config.rules.changeCutoffHours,
    );
    return { status: 'ok', appointmentId: id, emailIds, changed: true, manageVersion: updated.manageVersion };
  });
  return outcome;
}

/** El cliente cambia una cita suya desde "Mis citas" (US4), con el plazo. */
export async function rescheduleOwn(
  customerId: string,
  id: string,
  input: Record<string, string>,
  ctx: { now: Date },
): Promise<RescheduleResult> {
  try {
    const result = await rescheduleAppointment(id, input, 'customer', {
      now: ctx.now,
      enforceCutoff: true,
      customerId,
    });
    if (result.status === 'not_found')
      logger.warn({ customer_id: customerId, code: 'not_found' }, 'appointment_access_denied');
    else
      logger.info(
        { customer_id: customerId, appointment_id: id.slice(0, 64), code: result.status },
        'appointment_reschedule',
      );
    return result;
  } catch (error) {
    logger.error({ customer_id: customerId, code: errorCode(error) }, 'appointment_reschedule_failed');
    return { status: 'error' };
  }
}
