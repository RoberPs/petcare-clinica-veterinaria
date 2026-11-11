import {
  bookingWindow,
  describeWhen,
  longDateLabel,
  parseIsoDate,
  type BookableService,
  type BookableStaff,
} from '@/domain/availability';
import { NO_PREFERENCE } from '@/domain/booking-fields';
import { addDays } from '@/domain/time';
import type { BookingConfig } from '@/db/queries/booking-config';
import { nextDateWithSlots, slotsForDay } from './slots';

// Datos del paso "fecha y hora" al cambiar una cita (cliente y clínica): el servicio es fijo y se
// puede elegir profesional. Las horas no cuentan la propia cita (puede quedarse donde está).

export interface RescheduleView {
  service: BookableService;
  staffOptions: BookableStaff[];
  staffSlug: string;
  date: string;
  dayLabel: string;
  slots: string[];
  selected: string | null;
  today: string;
  lastDay: string;
  nextDate: string | null;
  nextLabel: string | null;
  errors: Record<string, string | undefined>;
  current: { longDate: string; time: string };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function rescheduleView(
  config: BookingConfig,
  appt: { id: string; bookingServiceId: string; teamMemberId: string; startsAt: Date },
  query: Record<string, string | string[] | undefined>,
  now: Date,
): Promise<RescheduleView | null> {
  const service = config.services.find((s) => s.id === appt.bookingServiceId);
  if (!service) return null;
  const { today, lastDay } = bookingWindow(now, config.rules);
  const staffOptions = config.staff.filter((m) => service.staffIds.includes(m.id));
  const currentStaff = staffOptions.find((m) => m.id === appt.teamMemberId)?.slug ?? NO_PREFERENCE;
  const requestedStaff = first(query.profesional);
  const staff =
    requestedStaff === NO_PREFERENCE
      ? null
      : (staffOptions.find((m) => m.slug === (requestedStaff ?? currentStaff)) ?? null);
  const staffSlug = staff?.slug ?? NO_PREFERENCE;
  const errors: Record<string, string | undefined> = {};

  const current = describeWhen(appt.startsAt);
  const requested = parseIsoDate(first(query.fecha) ?? '')?.toString();
  let date: string;
  if (requested && requested >= today && requested <= lastDay) {
    date = requested;
  } else {
    const base = { service, staffId: staff?.id ?? null, now, excludeId: appt.id };
    const fromCurrent = current.date >= today ? current.date : today;
    date = (await nextDateWithSlots(config, { ...base, from: fromCurrent })) ?? fromCurrent;
  }
  const slots = (
    await slotsForDay(config, { service, staffId: staff?.id ?? null, date, now, excludeId: appt.id })
  ).map((s) => s.time);
  const nextDate =
    slots.length === 0
      ? await nextDateWithSlots(config, {
          service,
          staffId: staff?.id ?? null,
          now,
          excludeId: appt.id,
          from: addDays(date, 1),
        })
      : null;

  return {
    service,
    staffOptions,
    staffSlug,
    date,
    dayLabel: longDateLabel(date),
    slots,
    selected: date === current.date && staff?.id === appt.teamMemberId ? current.time : null,
    today,
    lastDay,
    nextDate,
    nextLabel: nextDate ? longDateLabel(nextDate) : null,
    errors,
    current: { longDate: current.longDate, time: current.time },
  };
}
