import { Temporal } from '@js-temporal/polyfill';

// Utilidades de fecha y hora en la zona de la clínica. Todo se guarda en UTC y se muestra en Europe/Madrid.
export const CLINIC_TZ = 'Europe/Madrid';

export function zonedNow(now: Date = new Date()): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(CLINIC_TZ);
}

export function todayInClinic(now: Date = new Date()): string {
  return zonedNow(now).toPlainDate().toString();
}

export function addDays(isoDate: string, days: number): string {
  return Temporal.PlainDate.from(isoDate).add({ days }).toString();
}

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/** Nombre del día ISO (1 = lunes … 7 = domingo). */
export function weekdayName(isoWeekday: number): string {
  return WEEKDAYS[isoWeekday - 1] ?? '';
}

/** "10 de noviembre de 2026" */
export function formatLongDate(isoDate: string): string {
  const d = Temporal.PlainDate.from(isoDate);
  return `${d.day} de ${MONTHS[d.month - 1]} de ${d.year}`;
}

/** "25 de diciembre" */
export function formatDayMonth(isoDate: string): string {
  const d = Temporal.PlainDate.from(isoDate);
  return `${d.day} de ${MONTHS[d.month - 1]}`;
}

/** "09:00:00" → "09:00" */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

/** Fecha y hora de un instante en Europe/Madrid: "10/11/2026 13:05". */
export function formatDateTime(date: Date): string {
  const z = zonedNow(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(z.day)}/${pad(z.month)}/${z.year} ${pad(z.hour)}:${pad(z.minute)}`;
}
