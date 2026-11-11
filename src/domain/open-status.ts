import { Temporal } from '@js-temporal/polyfill';
import { CLINIC_TZ } from './time';

// "Abierto ahora" / "Cerrado ahora" (R10, FR-018), en Europe/Madrid y con los cierres excepcionales.

export interface WeeklySlot {
  weekday: number; // ISO: 1 = lunes … 7 = domingo
  opensAt: string; // "HH:MM" o "HH:MM:SS"
  closesAt: string;
}

export interface ClosureRange {
  startsOn: string; // "AAAA-MM-DD", incluido
  endsOn: string; // "AAAA-MM-DD", incluido
}

export interface ClinicMoment {
  date: string; // "AAAA-MM-DD" en Europe/Madrid
  time: string; // "HH:MM"
  weekday: number;
  daysFromToday: number;
}

export type OpenStatus =
  | { state: 'open'; closesAt: ClinicMoment }
  | { state: 'closed'; opensAt: ClinicMoment | null };

export const LOOKAHEAD_DAYS = 14;

function isClosedOn(date: Temporal.PlainDate, closures: readonly ClosureRange[]): boolean {
  const iso = date.toString();
  return closures.some((c) => c.startsOn <= iso && iso <= c.endsOn);
}

function at(date: Temporal.PlainDate, time: string): Temporal.ZonedDateTime {
  return date.toZonedDateTime({ timeZone: CLINIC_TZ, plainTime: Temporal.PlainTime.from(time) });
}

function moment(z: Temporal.ZonedDateTime, today: Temporal.PlainDate): ClinicMoment {
  const date = z.toPlainDate();
  return {
    date: date.toString(),
    time: z.toPlainTime().toString().slice(0, 5),
    weekday: date.dayOfWeek,
    daysFromToday: today.until(date, { largestUnit: 'days' }).days,
  };
}

export function getOpenStatus(
  now: Date,
  weeklyHours: readonly WeeklySlot[],
  closures: readonly ClosureRange[],
): OpenStatus {
  const current = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(CLINIC_TZ);
  const today = current.toPlainDate();

  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset++) {
    const day = today.add({ days: offset });
    if (isClosedOn(day, closures)) continue;
    const slots = weeklyHours
      .filter((s) => s.weekday === day.dayOfWeek)
      .map((s) => ({ start: at(day, s.opensAt), end: at(day, s.closesAt) }))
      .sort((a, b) => Temporal.ZonedDateTime.compare(a.start, b.start));
    for (const slot of slots) {
      const startCmp = Temporal.ZonedDateTime.compare(current, slot.start);
      const endCmp = Temporal.ZonedDateTime.compare(current, slot.end);
      if (startCmp >= 0 && endCmp < 0) return { state: 'open', closesAt: moment(slot.end, today) };
      if (startCmp < 0) return { state: 'closed', opensAt: moment(slot.start, today) };
    }
  }
  return { state: 'closed', opensAt: null };
}
