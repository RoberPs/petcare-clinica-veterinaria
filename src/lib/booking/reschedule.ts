import { Temporal } from '@js-temporal/polyfill';
import { and, eq, sql } from 'drizzle-orm';
import { isWithinChangeWindow } from '@/domain/appointment-view';
import { assignStaff } from '@/domain/assign-staff';
import {
  ADMIN_RULES,
  availableSlots,
  bookingWindow,
  localDateTime,
  parseIsoDate,
  slotsInDay,
  type BookableService,
  type BookableStaff,
  type BookingRules,
  type Slot,
} from '@/domain/availability';
import type { FieldErrors } from '@/domain/account-schemas';
import { getDb, type Tx } from '@/db/client';
import {
  busyIntervalsForDay,
  dayLoad,
  findAppointment,
  findAppointmentForUpdate,
  type AppointmentRow,
} from '@/db/queries/appointments';
import { loadBookingConfig, loadServiceForAdmin, refreshStaffHours, type BookingConfig } from '@/db/queries/booking-config';
import { appointments } from '@/db/schema';
import { getEmailContext } from '@/email/outbox';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import type { Actor } from './cancel';
import { resolveSlotChoice } from './book';
import { enqueueChangeEmails } from './emails';
import { recordAppointmentEvent } from './events';
import { dayBlockIntervals } from './slots';
import { withDayLocks } from './transaction';

// Cambiar una cita (B13, FR-024): la misma fila pasa a otro profesional, inicio y fin del mismo
// servicio. Bloquea el día antiguo y el nuevo (en orden), recalcula la disponibilidad sin contar la
// propia cita y actualiza en un solo UPDATE: la franja antigua queda libre y la nueva ocupada a la
// vez. manage_version + 1 y reminder_sent_at a NULL (el recordatorio se vuelve a programar, B17).
// Feature 007: los tramos y bloqueos se releen dentro del bloqueo (F7) y se escribe el evento
// `rescheduled` (F12). El panel usa `rescheduleAppointmentAdmin`, con las AdminRules (F11).

export type RescheduleResult =
  | { status: 'ok'; appointmentId: string; emailIds: string[]; changed: boolean; manageVersion: number }
  | { status: 'invalid'; fieldErrors: FieldErrors }
  | { status: 'slot_taken' }
  | { status: 'not_found' }
  | { status: 'out_of_window' }
  | { status: 'already_cancelled' }
  /** Panel: la versión del formulario no es la actual (FR-023). */
  | { status: 'stale' }
  | { status: 'error' };

export interface RescheduleOptions {
  now: Date;
  enforceCutoff: boolean;
  /** Si se pasa, la cita tiene que ser de ese cliente (A9). */
  customerId?: string;
  /** Enlace de gestión (B7): solo vale si la cita sigue en esta versión; si no, not_found. */
  expectedVersion?: number;
}

const eventActorFor = (actor: Exclude<Actor, 'system'>) => (actor === 'clinic' ? 'clinic_link' : 'customer');

interface Target {
  config: Pick<BookingConfig, 'weeklyHours' | 'closures' | 'rules'> & { staff: BookableStaff[] };
  service: BookableService;
  staffId: string | null;
  date: string;
  time: string;
  /** Franjas del día con la configuración releída. */
  slots: (input: { busy: Awaited<ReturnType<typeof busyIntervalsForDay>>; tx: Tx }) => Promise<Slot[]>;
}

async function applyReschedule(
  tx: Tx,
  row: AppointmentRow,
  target: Target,
  event: { actor: 'customer' | 'clinic_link' | 'admin'; adminId?: string; byClinic?: boolean },
  now: Date,
): Promise<RescheduleResult> {
  const { date, time, staffId } = target;
  const busy = await busyIntervalsForDay(tx, date, { excludeId: row.id });
  const free = (await target.slots({ busy, tx })).find((s) => s.time === time);
  if (!free) return { status: 'slot_taken' };

  // La misma hora: sin cambios y sin correo (contracts/forms.md).
  const sameStaff = staffId === null ? free.freeStaffIds.includes(row.teamMemberId) : staffId === row.teamMemberId;
  if (free.startsAt.getTime() === row.startsAt.getTime() && sameStaff) {
    return { status: 'ok', appointmentId: row.id, emailIds: [], changed: false, manageVersion: row.manageVersion };
  }

  const teamMemberId =
    staffId ?? assignStaff(free.freeStaffIds, await dayLoad(tx, date, row.id), target.config.staff.map((m) => m.id));
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
    .where(and(eq(appointments.id, row.id), eq(appointments.status, 'confirmed')))
    .returning();
  if (!updated) return { status: 'already_cancelled' };
  await recordAppointmentEvent(tx, {
    appointmentId: row.id,
    kind: 'rescheduled',
    actor: event.actor,
    adminId: event.adminId,
    at: now,
    fromStartsAt: row.startsAt,
    toStartsAt: updated.startsAt,
    fromStaffId: row.teamMemberId,
    toStaffId: updated.teamMemberId,
  });
  const emailCtx = await getEmailContext(tx);
  const emailIds = await enqueueChangeEmails(tx, updated, row.startsAt, emailCtx, target.config.rules.changeCutoffHours, {
    byClinic: event.byClinic,
    previousStaffId: row.teamMemberId,
  });
  return { status: 'ok', appointmentId: row.id, emailIds, changed: true, manageVersion: updated.manageVersion };
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

  return withDayLocks(getDb(), [oldDate, date], async (tx): Promise<RescheduleResult> => {
    const row = await findAppointmentForUpdate(tx, id);
    if (!row || (options.customerId !== undefined && row.customerId !== options.customerId))
      return { status: 'not_found' };
    if (options.expectedVersion !== undefined && row.manageVersion !== options.expectedVersion) return { status: 'not_found' };
    if (row.status === 'cancelled' || row.startsAt.getTime() <= now.getTime())
      return { status: 'already_cancelled' };
    if (options.enforceCutoff && !isWithinChangeWindow(row.startsAt, now, config.rules.changeCutoffHours)) {
      return { status: 'out_of_window' };
    }
    return applyReschedule(
      tx,
      row,
      {
        config,
        service,
        staffId: staff?.id ?? null,
        date,
        time,
        slots: async ({ busy, tx: t }) => {
          const [fresh, blocks] = await Promise.all([refreshStaffHours(config, t), dayBlockIntervals(date, t)]);
          return availableSlots({ ...fresh, date, service, staffId: staff?.id ?? null, blocks, busy, now });
        },
      },
      { actor: eventActorFor(actor) },
      now,
    );
  });
}

export interface AdminMoveInput {
  adminId: string;
  /** manage_version que vio el administrador. */
  version: number;
  date: string;
  time: string;
  staffId: string;
}

/** Franjas libres para mover una cita desde el panel (AdminRules), sin contar la propia cita. */
export async function adminMoveSlots(
  appointment: Pick<AppointmentRow, 'id' | 'bookingServiceId'>,
  date: string,
  staffId: string | null,
  now: Date,
  db: Tx | ReturnType<typeof getDb> = getDb(),
): Promise<{ slots: Slot[]; staff: BookableStaff[]; lastDay: string } | null> {
  const config = await loadBookingConfig(db);
  const ctx = await loadServiceForAdmin(appointment.bookingServiceId, db);
  if (!config || !ctx) return null;
  const { lastDay } = bookingWindow(now, { horizonDays: ADMIN_RULES.horizonDays });
  const day = parseIsoDate(date);
  const { today } = bookingWindow(now, config.rules);
  if (!day || date < today || date > lastDay) return { slots: [], staff: ctx.staff, lastDay };
  const [busy, blocks] = await Promise.all([
    busyIntervalsForDay(db, date, { excludeId: appointment.id }),
    dayBlockIntervals(date, db),
  ]);
  const slots = adminSlots(day, config, ctx, staffId, busy, blocks, now);
  return { slots, staff: ctx.staff, lastDay };
}

function adminSlots(
  day: Temporal.PlainDate,
  config: Pick<BookingConfig, 'weeklyHours' | 'closures'> & { rules: BookingRules },
  ctx: { service: BookableService; staff: BookableStaff[] },
  staffId: string | null,
  busy: Awaited<ReturnType<typeof busyIntervalsForDay>>,
  blocks: Awaited<ReturnType<typeof dayBlockIntervals>>,
  now: Date,
): Slot[] {
  return slotsInDay(
    day,
    {
      service: ctx.service,
      staffId,
      staff: ctx.staff,
      weeklyHours: config.weeklyHours,
      closures: config.closures,
      blocks,
      busy,
      rules: config.rules,
    },
    // Solo franjas futuras (antelación 0).
    now.getTime() + ADMIN_RULES.minLeadMinutes * 60_000,
  );
}

/**
 * Mover una cita desde el panel (F11, FR-021): sin antelación mínima ni horizonte de la reserva
 * pública, pero con el horario, los bloqueos y sin solapes. El servicio puede estar inactivo; el
 * veterinario tiene que ser reservable y atender el servicio. Comprueba `manage_version` (FR-023):
 * un reenvío de un cambio ya aplicado devuelve `ok` sin otro correo.
 */
export async function rescheduleAppointmentAdmin(id: string, move: AdminMoveInput, now: Date): Promise<RescheduleResult> {
  const config = await loadBookingConfig();
  const current = await findAppointment(id);
  if (!config || !current) return { status: 'not_found' };
  const ctx = await loadServiceForAdmin(current.bookingServiceId);
  if (!ctx) return { status: 'not_found' };
  const day = parseIsoDate(move.date);
  const { today } = bookingWindow(now, config.rules);
  const { lastDay } = bookingWindow(now, { horizonDays: ADMIN_RULES.horizonDays });
  const errors: FieldErrors = {};
  if (!day || move.date < today || move.date > lastDay) errors.date = `Elige una fecha entre hoy y el ${lastDay}.`;
  if (!ctx.staff.some((m) => m.id === move.staffId))
    errors.staff_id = 'Este veterinario no atiende este servicio o no recibe reservas.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(move.time)) errors.time = 'Elige una hora.';
  if (Object.keys(errors).length > 0 || !day) return { status: 'invalid', fieldErrors: errors };
  const oldDate = localDateTime(current.startsAt).date;

  return withDayLocks(getDb(), [oldDate, move.date], async (tx): Promise<RescheduleResult> => {
    const row = await findAppointmentForUpdate(tx, id);
    if (!row) return { status: 'not_found' };
    if (row.manageVersion !== move.version) {
      // Reenvío del mismo cambio: ya está hecho (idempotencia).
      const when = localDateTime(row.startsAt);
      if (
        row.status === 'confirmed' &&
        row.manageVersion === move.version + 1 &&
        when.date === move.date &&
        when.time === move.time &&
        row.teamMemberId === move.staffId
      ) {
        return { status: 'ok', appointmentId: id, emailIds: [], changed: false, manageVersion: row.manageVersion };
      }
      return { status: 'stale' };
    }
    if (row.status === 'cancelled' || row.startsAt.getTime() <= now.getTime()) return { status: 'already_cancelled' };
    const fresh = await loadServiceForAdmin(row.bookingServiceId, tx);
    if (!fresh || !fresh.staff.some((m) => m.id === move.staffId)) return { status: 'slot_taken' };
    return applyReschedule(
      tx,
      row,
      {
        config: { ...config, staff: fresh.staff },
        service: fresh.service,
        staffId: move.staffId,
        date: move.date,
        time: move.time,
        slots: async ({ busy, tx: t }) =>
          adminSlots(day, config, fresh, move.staffId, busy, await dayBlockIntervals(move.date, t), now),
      },
      { actor: 'admin', adminId: move.adminId, byClinic: true },
      now,
    );
  });
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
