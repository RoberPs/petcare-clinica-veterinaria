import { Temporal } from '@js-temporal/polyfill';
import type { ClosureRange, WeeklySlot } from './open-status';
import { CLINIC_TZ, formatLongDate, weekdayName } from './time';

// Disponibilidad de citas (B3): función pura sobre el horario, los cierres, la duración del servicio
// y los intervalos ocupados. Es la misma al mostrar las horas y al confirmar la reserva.

export interface BookingRules {
  slotStepMinutes: number;
  minLeadMinutes: number;
  horizonDays: number;
  changeCutoffHours: number;
  maxActivePerEmail: number;
  maxActivePerCustomer: number;
  reminderHoursBefore: number;
  retentionMonths: number;
}

export interface BookableService {
  id: string;
  slug: string;
  name: string;
  durationMinutes: number;
  /** Profesionales que atienden el servicio. */
  staffIds: string[];
}

export interface BookableStaff {
  id: string;
  slug: string;
  name: string;
  position: number;
}

export interface BusyInterval {
  teamMemberId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface Slot {
  /** "HH:MM" en la zona de la clínica. */
  time: string;
  startsAt: Date;
  endsAt: Date;
  /** Profesionales elegibles y libres a esa hora, por `position`. */
  freeStaffIds: string[];
}

export interface AvailabilityInput {
  /** "AAAA-MM-DD" en la zona de la clínica. */
  date: string;
  service: BookableService;
  /** null = "Sin preferencia". */
  staffId: string | null;
  /** Profesionales reservables (publicados). */
  staff: readonly BookableStaff[];
  weeklyHours: readonly WeeklySlot[];
  closures: readonly ClosureRange[];
  busy: readonly BusyInterval[];
  rules: BookingRules;
  now: Date;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha válida "AAAA-MM-DD" o null. */
export function parseIsoDate(value: string): Temporal.PlainDate | null {
  if (!ISO_DATE_RE.test(value)) return null;
  try {
    return Temporal.PlainDate.from(value, { overflow: 'reject' });
  } catch {
    return null;
  }
}

/** Hoy en la clínica y el último día reservable (hoy + horizonte). */
export function bookingWindow(now: Date, rules: Pick<BookingRules, 'horizonDays'>): { today: string; lastDay: string } {
  const today = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(CLINIC_TZ).toPlainDate();
  return { today: today.toString(), lastDay: today.add({ days: rules.horizonDays }).toString() };
}

/** Inicio y fin (excluido) de un día de la clínica como instantes, para buscar sus citas. */
export function dayBounds(dateIso: string, days = 1): { start: Date; end: Date } {
  const day = Temporal.PlainDate.from(dateIso);
  const start = day.toZonedDateTime({ timeZone: CLINIC_TZ }).epochMilliseconds;
  const end = day.add({ days }).toZonedDateTime({ timeZone: CLINIC_TZ }).epochMilliseconds;
  return { start: new Date(start), end: new Date(end) };
}

/** Fecha ("AAAA-MM-DD") y hora ("HH:MM") de un instante en la zona de la clínica. */
export function localDateTime(at: Date): { date: string; time: string } {
  const z = Temporal.Instant.fromEpochMilliseconds(at.getTime()).toZonedDateTimeISO(CLINIC_TZ);
  return { date: z.toPlainDate().toString(), time: `${pad(z.hour)}:${pad(z.minute)}` };
}

export interface AppointmentWhen {
  /** "AAAA-MM-DD" */
  date: string;
  /** "HH:MM" */
  time: string;
  /** "martes, 17 de noviembre de 2026" */
  longDate: string;
  /** "17/11/2026" */
  shortDate: string;
}

/** "martes, 17 de noviembre de 2026" a partir de "AAAA-MM-DD". */
export function longDateLabel(dateIso: string): string {
  return `${weekdayName(Temporal.PlainDate.from(dateIso).dayOfWeek)}, ${formatLongDate(dateIso)}`;
}

/** Fecha y hora de una cita para mostrarlas, en la zona de la clínica. */
export function describeWhen(at: Date): AppointmentWhen {
  const { date, time } = localDateTime(at);
  const d = Temporal.PlainDate.from(date);
  return {
    date,
    time,
    longDate: longDateLabel(date),
    shortDate: `${pad(d.day)}/${pad(d.month)}/${d.year}`,
  };
}

function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Instante de una hora local; null si no existe o es ambigua (cambio de hora, B3). */
function localInstant(date: Temporal.PlainDate, minutes: number): Temporal.Instant | null {
  try {
    return date
      .toPlainDateTime({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
      .toZonedDateTime(CLINIC_TZ, { disambiguation: 'reject' })
      .toInstant();
  } catch {
    return null;
  }
}

function closingInstant(date: Temporal.PlainDate, minutes: number): Temporal.Instant {
  return date
    .toPlainDateTime({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
    .toZonedDateTime(CLINIC_TZ, { disambiguation: 'earlier' })
    .toInstant();
}

/** Profesionales elegibles para el servicio y la preferencia, por `position`. */
function eligibleStaff(input: Pick<AvailabilityInput, 'service' | 'staffId' | 'staff'>): string[] {
  return [...input.staff]
    .filter((m) => input.service.staffIds.includes(m.id) && (input.staffId === null || m.id === input.staffId))
    .sort((a, b) => a.position - b.position)
    .map((m) => m.id);
}

export function availableSlots(input: AvailabilityInput): Slot[] {
  const day = parseIsoDate(input.date);
  if (!day) return [];
  const { today, lastDay } = bookingWindow(input.now, input.rules);
  const iso = day.toString();
  if (iso < today || iso > lastDay) return [];
  if (input.closures.some((c) => c.startsOn <= iso && iso <= c.endsOn)) return [];

  const staffIds = eligibleStaff(input);
  if (staffIds.length === 0) return [];

  const step = input.rules.slotStepMinutes;
  const duration = input.service.durationMinutes;
  const earliest = input.now.getTime() + input.rules.minLeadMinutes * 60_000;
  const busyByStaff = new Map<string, BusyInterval[]>();
  for (const b of input.busy) busyByStaff.set(b.teamMemberId, [...(busyByStaff.get(b.teamMemberId) ?? []), b]);

  const slots: Slot[] = [];
  const ranges = input.weeklyHours
    .filter((h) => h.weekday === day.dayOfWeek)
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  for (const range of ranges) {
    const opens = toMinutes(range.opensAt);
    const closes = toMinutes(range.closesAt);
    const closeAt = closingInstant(day, closes).epochMilliseconds;
    for (let m = opens; m + duration <= closes; m += step) {
      const start = localInstant(day, m);
      if (!start) continue;
      const startMs = start.epochMilliseconds;
      const endMs = startMs + duration * 60_000;
      if (endMs > closeAt || startMs < earliest) continue;
      const free = staffIds.filter(
        (id) => !(busyByStaff.get(id) ?? []).some((b) => b.startsAt.getTime() < endMs && startMs < b.endsAt.getTime()),
      );
      if (free.length === 0) continue;
      slots.push({ time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, startsAt: new Date(startMs), endsAt: new Date(endMs), freeStaffIds: free });
    }
  }
  return slots;
}

/** Primer día desde `from` (incluido) con alguna hora libre, hasta el horizonte; null si no hay. */
export function nextAvailableDate(input: Omit<AvailabilityInput, 'date'> & { from: string }): string | null {
  const from = parseIsoDate(input.from);
  if (!from) return null;
  const { today, lastDay } = bookingWindow(input.now, input.rules);
  let day = from.toString() < today ? Temporal.PlainDate.from(today) : from;
  while (day.toString() <= lastDay) {
    if (availableSlots({ ...input, date: day.toString() }).length > 0) return day.toString();
    day = day.add({ days: 1 });
  }
  return null;
}
