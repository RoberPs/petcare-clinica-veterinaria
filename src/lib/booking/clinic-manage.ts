import { getDb } from '@/db/client';
import { findAppointment, type AppointmentRow } from '@/db/queries/appointments';
import { namesFor } from '@/db/queries/booking-config';
import { getEmailContext } from '@/email/outbox';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { cancelAppointment } from './cancel';
import { signManageToken, verifyManageToken } from './manage-link';
import { rescheduleAppointment, type RescheduleResult } from './reschedule';

// Gestión de una cita por la clínica con el enlace firmado de su correo (B7, FR-027). Vale para una
// sola cita, mientras esté confirmada, sea futura y su manage_version coincida con la del enlace.
// No aplica el plazo de 24 h. Cada uso queda en el log solo con el id de la cita y el resultado.

export type ManagedRead =
  | { status: 'ok'; appointment: AppointmentRow; version: number; serviceName: string; staffName: string }
  | { status: 'invalid' };

function logUse(event: string, appointmentId: string | null, code: string): void {
  logger.info({ appointment_id: appointmentId, code }, event);
}

export async function readManagedAppointment(token: string, now: Date): Promise<ManagedRead> {
  const data = verifyManageToken(token);
  if (!data) {
    logUse('manage_link_view', null, 'bad_token');
    return { status: 'invalid' };
  }
  const appt = await findAppointment(data.appointmentId);
  const code = !appt
    ? 'not_found'
    : appt.manageVersion !== data.version
      ? 'old_version'
      : appt.status !== 'confirmed'
        ? 'cancelled'
        : appt.startsAt.getTime() <= now.getTime()
          ? 'past'
          : 'ok';
  logUse('manage_link_view', data.appointmentId, code);
  if (code !== 'ok' || !appt) return { status: 'invalid' };
  const names = await namesFor([appt.bookingServiceId], [appt.teamMemberId]);
  return {
    status: 'ok',
    appointment: appt,
    version: data.version,
    serviceName: names.services.get(appt.bookingServiceId) ?? '—',
    staffName: names.staff.get(appt.teamMemberId) ?? '—',
  };
}

export type ClinicCancelResult = { status: 'ok'; emailIds: string[] } | { status: 'invalid' } | { status: 'error' };

export async function clinicCancel(token: string, ctx: { now: Date }): Promise<ClinicCancelResult> {
  const data = verifyManageToken(token);
  if (!data) {
    logUse('manage_link_cancel', null, 'bad_token');
    return { status: 'invalid' };
  }
  try {
    const emailCtx = await getEmailContext();
    const r = await getDb().transaction((tx) =>
      cancelAppointment(tx, data.appointmentId, 'clinic', ctx.now, {
        enforceCutoff: false,
        cutoffHours: 0,
        emailCtx,
        expectedVersion: data.version,
      }),
    );
    logUse('manage_link_cancel', data.appointmentId, r.status);
    return r.status === 'ok' ? { status: 'ok', emailIds: r.emailIds } : r.status === 'error' ? r : { status: 'invalid' };
  } catch (error) {
    logger.error({ appointment_id: data.appointmentId, code: errorCode(error) }, 'manage_link_cancel_failed');
    return { status: 'error' };
  }
}

export type ClinicRescheduleResult =
  | { status: 'ok'; emailIds: string[]; token: string }
  | { status: 'slot_taken' }
  | { status: 'invalid' }
  | { status: 'error' };

export async function clinicReschedule(token: string, input: Record<string, string>, ctx: { now: Date }): Promise<ClinicRescheduleResult> {
  const data = verifyManageToken(token);
  if (!data) {
    logUse('manage_link_reschedule', null, 'bad_token');
    return { status: 'invalid' };
  }
  try {
    const r: RescheduleResult = await rescheduleAppointment(data.appointmentId, input, 'clinic', {
      now: ctx.now,
      enforceCutoff: false,
      expectedVersion: data.version,
    });
    logUse('manage_link_reschedule', data.appointmentId, r.status);
    switch (r.status) {
      case 'ok':
        // El enlace nuevo es el de la versión actual (si no ha cambiado nada, el mismo).
        return { status: 'ok', emailIds: r.emailIds, token: signManageToken({ appointmentId: data.appointmentId, version: r.manageVersion }) };
      case 'slot_taken':
      case 'invalid':
        return { status: 'slot_taken' };
      case 'error':
        return r;
      default:
        return { status: 'invalid' };
    }
  } catch (error) {
    logger.error({ appointment_id: data.appointmentId, code: errorCode(error) }, 'manage_link_reschedule_failed');
    return { status: 'error' };
  }
}
