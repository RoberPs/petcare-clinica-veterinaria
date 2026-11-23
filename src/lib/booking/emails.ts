import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import type { AppointmentRow } from '@/db/queries/appointments';
import { bookingServices, teamMembers } from '@/db/schema';
import { enqueueEmail, type EmailContext } from '@/email/outbox';
import { appointmentCancelled } from '@/email/templates/appointment-cancelled';
import { appointmentChanged } from '@/email/templates/appointment-changed';
import type { AppointmentEmailData } from '@/email/templates/appointment-common';
import { appointmentConfirmed } from '@/email/templates/appointment-confirmed';
import { appointmentReminder } from '@/email/templates/appointment-reminder';
import { clinicAppointment } from '@/email/templates/clinic-appointment';
import { managePath } from './manage-link';

// Encolado de los correos de cita (B8): se renderizan y encolan en la misma transacción que el
// cambio de la cita, con su appointment_id. Devuelven los ids para el intento inmediato.

export async function emailData(tx: DbOrTx, row: AppointmentRow): Promise<AppointmentEmailData | null> {
  // Una cita anonimizada ya no tiene a quién escribir.
  if (!row.contactEmail || !row.contactName) return null;
  const [[service], [staff]] = await Promise.all([
    tx
      .select({ name: bookingServices.name })
      .from(bookingServices)
      .where(eq(bookingServices.id, row.bookingServiceId))
      .limit(1),
    tx
      .select({ name: teamMembers.name })
      .from(teamMembers)
      .where(eq(teamMembers.id, row.teamMemberId))
      .limit(1),
  ]);
  return {
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    serviceName: service?.name ?? '—',
    staffName: staff?.name ?? '—',
    petName: row.petName,
    petSpeciesLabel: row.petSpeciesLabel,
    startsAt: row.startsAt,
    reason: row.reason,
    bookedAs: row.bookedAs,
  };
}

const manageUrl = (ctx: EmailContext, row: AppointmentRow) =>
  `${ctx.siteUrl}${managePath({ appointmentId: row.id, version: row.manageVersion })}`;

async function enqueue(
  tx: DbOrTx,
  row: AppointmentRow,
  kind: Parameters<typeof enqueueEmail>[1]['kind'],
  email: ReturnType<typeof appointmentConfirmed>,
): Promise<string> {
  const { id } = await enqueueEmail(tx, {
    kind,
    to: email.to.email,
    email,
    customerId: row.customerId,
    appointmentId: row.id,
  });
  return id;
}

/** Cita nueva: confirmación al responsable y aviso a la clínica con el enlace de gestión. */
export async function enqueueBookingEmails(
  tx: DbOrTx,
  row: AppointmentRow,
  ctx: EmailContext,
  options: { cutoffHours: number; hasAccount: boolean },
): Promise<string[]> {
  const d = await emailData(tx, row);
  if (!d) return [];
  const variant = row.bookedAs;
  return [
    await enqueue(
      tx,
      row,
      'appointment_confirmed',
      appointmentConfirmed(ctx, d, {
        variant,
        cutoffHours: options.cutoffHours,
        hasAccount: options.hasAccount,
      }),
    ),
    await enqueue(
      tx,
      row,
      'clinic_appointment',
      clinicAppointment(ctx, d, { action: 'new', manageUrl: manageUrl(ctx, row) }),
    ),
  ];
}

/** Cita cambiada: al responsable y a la clínica (con el enlace de la versión nueva). */
export async function enqueueChangeEmails(
  tx: DbOrTx,
  row: AppointmentRow,
  previousStartsAt: Date,
  ctx: EmailContext,
  cutoffHours: number,
  options: { byClinic?: boolean; previousStaffId?: string } = {},
): Promise<string[]> {
  const d = await emailData(tx, row);
  if (!d) return [];
  let previousStaffName: string | undefined;
  if (options.byClinic && options.previousStaffId) {
    const [prev] = await tx
      .select({ name: teamMembers.name })
      .from(teamMembers)
      .where(eq(teamMembers.id, options.previousStaffId))
      .limit(1);
    previousStaffName = prev?.name;
  }
  return [
    await enqueue(
      tx,
      row,
      'appointment_changed',
      appointmentChanged(ctx, d, {
        previousStartsAt,
        variant: row.bookedAs,
        cutoffHours,
        byClinic: options.byClinic,
        previousStaffName,
      }),
    ),
    await enqueue(
      tx,
      row,
      'clinic_appointment',
      clinicAppointment(ctx, d, { action: 'changed', manageUrl: manageUrl(ctx, row), previousStartsAt }),
    ),
  ];
}

/**
 * Cita cancelada: al responsable (salvo si cancela el sistema o `notifyOwner` es false, como al
 * eliminar una mascota, B12) y siempre a la clínica.
 */
export async function enqueueCancelEmails(
  tx: DbOrTx,
  row: AppointmentRow,
  actor: 'customer' | 'clinic' | 'system',
  ctx: EmailContext,
  options: { notifyOwner?: boolean; byClinic?: boolean; clinicNote?: string | null } = {},
): Promise<string[]> {
  const d = await emailData(tx, row);
  if (!d) return [];
  const ids: string[] = [];
  if (actor !== 'system' && options.notifyOwner !== false)
    ids.push(
      await enqueue(
        tx,
        row,
        'appointment_cancelled',
        appointmentCancelled(ctx, d, { by: actor, byClinic: options.byClinic, clinicNote: options.clinicNote }),
      ),
    );
  ids.push(
    await enqueue(
      tx,
      row,
      'clinic_appointment',
      clinicAppointment(ctx, d, { action: 'cancelled', cancelledBy: actor }),
    ),
  );
  return ids;
}

/** Recordatorio (B17). */
export async function enqueueReminderEmail(
  tx: DbOrTx,
  row: AppointmentRow,
  ctx: EmailContext,
  cutoffHours: number,
): Promise<string | null> {
  const d = await emailData(tx, row);
  if (!d) return null;
  return enqueue(
    tx,
    row,
    'appointment_reminder',
    appointmentReminder(ctx, d, { variant: row.bookedAs, cutoffHours }),
  );
}
