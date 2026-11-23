import { Temporal } from '@js-temporal/polyfill';
import { blocksForStaff, localEnd, localStart, type BlockInterval } from './blocks';
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

/**
 * Reglas del panel al mover una cita (F11, FR-021): sin antelación mínima, horizonte de 365 días,
 * sin plazo de cambio y solo franjas futuras.
 */
export const ADMIN_RULES = { minLeadMinutes: 0, horizonDays: 365, futureOnly: true } as const;

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
  /** Orden de la reserva (`booking_position`). */
  position: number;
  /** Horario semanal del veterinario (F6). Sin tramos no ofrece nada (FR-017). */
  hours: readonly WeeklySlot[];
}

/** Intervalo absoluto. */
export interface TimeWindow {
  start: Date;
  end: Date;
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
  /** Horario general de la clínica. */
  weeklyHours: readonly WeeklySlot[];
  closures: readonly ClosureRange[];
  /** Bloqueos ya expandidos (de cualquier día; solo cuentan los que tocan el día consultado). */
  blocks: readonly BlockInterval[];
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

/** Profesionales elegibles para el servicio y la preferencia, por `position`. */
function eligibleStaff(input: Pick<AvailabilityInput, 'service' | 'staffId' | 'staff'>): string[] {
  return [...input.staff]
    .filter((m) => input.service.staffIds.includes(m.id) && (input.staffId === null || m.id === input.staffId))
    .sort((a, b) => a.position - b.position)
    .map((m) => m.id);
}

/** Tramos locales (minutos del día) de la intersección clínica ∩ veterinario de un día de la semana. */
function intersectHours(
  weekday: number,
  clinicHours: readonly WeeklySlot[],
  staffHours: readonly WeeklySlot[],
): { opens: number; closes: number }[] {
  const clinic = clinicHours.filter((h) => h.weekday === weekday);
  const staff = staffHours.filter((h) => h.weekday === weekday);
  const out: { opens: number; closes: number }[] = [];
  for (const c of clinic) {
    for (const s of staff) {
      const opens = Math.max(toMinutes(c.opensAt), toMinutes(s.opensAt));
      const closes = Math.min(toMinutes(c.closesAt), toMinutes(s.closesAt));
      if (opens < closes) out.push({ opens, closes });
    }
  }
  return out.sort((a, b) => a.opens - b.opens);
}

/** Resta de intervalos absolutos (ms): `windows` − `cuts`. */
function subtract(windows: { start: number; end: number }[], cuts: { start: number; end: number }[]) {
  let current = windows;
  for (const cut of cuts) {
    const next: { start: number; end: number }[] = [];
    for (const w of current) {
      if (cut.end <= w.start || cut.start >= w.end) {
        next.push(w);
        continue;
      }
      if (cut.start > w.start) next.push({ start: w.start, end: cut.start });
      if (cut.end < w.end) next.push({ start: cut.end, end: w.end });
    }
    current = next;
  }
  return current;
}

export interface StaffWindowsInput {
  clinicHours: readonly WeeklySlot[];
  /** Horario del veterinario. */
  staffHours: readonly WeeklySlot[];
  closures: readonly ClosureRange[];
  /** Bloqueos que le afectan (los suyos y los de la clínica), ya expandidos. */
  blocks: readonly Pick<BlockInterval, 'startsAt' | 'endsAt'>[];
  /** "AAAA-MM-DD" */
  day: string;
}

/**
 * Ventanas en las que un veterinario atiende un día (F7):
 * (horario de la clínica ∩ horario del veterinario) − cierres − bloqueos.
 */
export function staffWindows(input: StaffWindowsInput): TimeWindow[] {
  const day = parseIsoDate(input.day);
  if (!day) return [];
  const iso = day.toString();
  if (input.closures.some((c) => c.startsOn <= iso && iso <= c.endsOn)) return [];
  const base = intersectHours(day.dayOfWeek, input.clinicHours, input.staffHours).map((r) => ({
    start: localStart(day, r.opens),
    end: localEnd(day, r.closes),
  }));
  const cuts = input.blocks.map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt.getTime() }));
  return subtract(base, cuts)
    .filter((w) => w.start < w.end)
    .map((w) => ({ start: new Date(w.start), end: new Date(w.end) }));
}

export function availableSlots(input: AvailabilityInput): Slot[] {
  const day = parseIsoDate(input.date);
  if (!day) return [];
  const { today, lastDay } = bookingWindow(input.now, input.rules);
  const iso = day.toString();
  if (iso < today || iso > lastDay) return [];
  if (input.closures.some((c) => c.startsOn <= iso && iso <= c.endsOn)) return [];
  return slotsInDay(day, input, input.now.getTime() + input.rules.minLeadMinutes * 60_000);
}

/**
 * Franjas de un día sin comprobar el horizonte ni la antelación de la reserva pública: las usa el
 * panel para mover una cita (AdminRules: solo franjas futuras). Misma función de ventanas.
 */
export function slotsInDay(
  day: Temporal.PlainDate,
  input: Omit<AvailabilityInput, 'date' | 'rules' | 'now'> & { rules: Pick<BookingRules, 'slotStepMinutes'> },
  earliestMs: number,
): Slot[] {
  const staffIds = eligibleStaff(input);
  if (staffIds.length === 0) return [];
  const iso = day.toString();
  const step = input.rules.slotStepMinutes;
  const duration = input.service.durationMinutes;
  const busyByStaff = new Map<string, BusyInterval[]>();
  for (const b of input.busy) busyByStaff.set(b.teamMemberId, [...(busyByStaff.get(b.teamMemberId) ?? []), b]);

  // Rejilla: desde el inicio de cada tramo clínica ∩ veterinario (antes de restar los bloqueos), cada `step`.
  const byId = new Map(input.staff.map((m) => [m.id, m]));
  const windows = new Map<string, TimeWindow[]>();
  const candidates = new Set<number>();
  for (const id of staffIds) {
    const member = byId.get(id)!;
    windows.set(
      id,
      staffWindows({
        clinicHours: input.weeklyHours,
        staffHours: member.hours,
        closures: input.closures,
        blocks: blocksForStaff(input.blocks, id),
        day: iso,
      }),
    );
    for (const r of intersectHours(day.dayOfWeek, input.weeklyHours, member.hours)) {
      for (let m = r.opens; m + duration <= r.closes; m += step) candidates.add(m);
    }
  }

  const slots: Slot[] = [];
  for (const m of [...candidates].sort((a, b) => a - b)) {
    const start = localInstant(day, m);
    if (!start) continue;
    const startMs = start.epochMilliseconds;
    const endMs = startMs + duration * 60_000;
    if (startMs < earliestMs) continue;
    const free = staffIds.filter(
      (id) =>
        (windows.get(id) ?? []).some((w) => w.start.getTime() <= startMs && endMs <= w.end.getTime()) &&
        !(busyByStaff.get(id) ?? []).some((b) => b.startsAt.getTime() < endMs && startMs < b.endsAt.getTime()),
    );
    if (free.length === 0) continue;
    slots.push({ time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, startsAt: new Date(startMs), endsAt: new Date(endMs), freeStaffIds: free });
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
