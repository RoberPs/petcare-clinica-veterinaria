import { getDb } from '@/db/client';
import { findAppointmentForUpdate } from '@/db/queries/appointments';
import type { CancelFormData, MoveFormData } from '@/domain/admin-schemas';
import { getEmailContext } from '@/email/outbox';
import { errorCode } from '@/lib/account/common';
import { cancelAppointment } from '@/lib/booking/cancel';
import { adminMoveSlots, rescheduleAppointmentAdmin } from '@/lib/booking/reschedule';
import { logger } from '@/lib/logger';
import type { AdminActor } from './common';

// Cancelar y mover desde el panel (US4, F11). Reutiliza las funciones de la 003 (la reserva sigue
// siendo la única que escribe citas): mismos bloqueos por día, exclusión GiST, eventos y correos.
// Comprueban manage_version (FR-023); un reenvío de lo ya hecho devuelve ok sin otro correo.

export { adminMoveSlots };

export type AdminAppointmentResult =
  | { status: 'ok'; emailIds: string[] }
  | { status: 'stale' }
  | { status: 'not_editable' }
  | { status: 'slot_taken' }
  | { status: 'invalid'; fieldErrors: Record<string, string> }
  | { status: 'not_found' }
  | { status: 'error' };

interface Options {
  now: Date;
  /** Intento de envío inmediato tras el commit (SC-004): after() en la acción, directo en los tests. */
  onEmails?: (ids: string[]) => void | Promise<void>;
}

async function deliver(ids: string[], onEmails: Options['onEmails']) {
  if (ids.length > 0 && onEmails) await onEmails(ids);
}

export async function adminCancel(admin: AdminActor, input: CancelFormData, options: Options): Promise<AdminAppointmentResult> {
  const { now } = options;
  try {
    const emailCtx = await getEmailContext();
    const result = await getDb().transaction(async (tx): Promise<AdminAppointmentResult> => {
      const row = await findAppointmentForUpdate(tx, input.id);
      if (!row) return { status: 'not_found' };
      if (row.manageVersion !== input.version) {
        // Reenvío de esta misma cancelación: ya está hecha.
        if (row.status === 'cancelled' && row.cancelledBy === 'clinic' && row.manageVersion === input.version + 1) {
          return { status: 'ok', emailIds: [] };
        }
        return { status: 'stale' };
      }
      if (row.status === 'cancelled' || row.startsAt.getTime() <= now.getTime()) return { status: 'not_editable' };
      const r = await cancelAppointment(tx, input.id, 'clinic', now, {
        enforceCutoff: false,
        cutoffHours: 0,
        emailCtx,
        eventActor: 'admin',
        adminId: admin.id,
        note: input.note,
        byClinic: true,
      });
      if (r.status === 'ok') return { status: 'ok', emailIds: r.emailIds };
      return r.status === 'not_found' ? { status: 'not_found' } : { status: 'not_editable' };
    });
    logger.info({ admin_id: admin.id, appointment_id: input.id, code: result.status }, 'admin_appointment_cancel');
    if (result.status === 'ok') await deliver(result.emailIds, options.onEmails);
    return result;
  } catch (error) {
    logger.error({ admin_id: admin.id, appointment_id: input.id, code: errorCode(error) }, 'admin_appointment_cancel_failed');
    return { status: 'error' };
  }
}

export async function adminMove(admin: AdminActor, input: MoveFormData, options: Options): Promise<AdminAppointmentResult> {
  const { now } = options;
  try {
    const r = await rescheduleAppointmentAdmin(
      input.id,
      { adminId: admin.id, version: input.version, date: input.date, time: input.time, staffId: input.staff_id },
      now,
    );
    logger.info({ admin_id: admin.id, appointment_id: input.id, code: r.status }, 'admin_appointment_move');
    switch (r.status) {
      case 'ok':
        await deliver(r.emailIds, options.onEmails);
        return { status: 'ok', emailIds: r.emailIds };
      case 'stale':
        return { status: 'stale' };
      case 'already_cancelled':
      case 'out_of_window':
        return { status: 'not_editable' };
      case 'slot_taken':
        return { status: 'slot_taken' };
      case 'invalid':
        return { status: 'invalid', fieldErrors: r.fieldErrors as Record<string, string> };
      case 'not_found':
        return { status: 'not_found' };
      default:
        return { status: 'error' };
    }
  } catch (error) {
    logger.error({ admin_id: admin.id, appointment_id: input.id, code: errorCode(error) }, 'admin_appointment_move_failed');
    return { status: 'error' };
  }
}
