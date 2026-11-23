import { Temporal } from '@js-temporal/polyfill';
import { CLINIC_TZ, formatLongDate } from './time';

// Bloqueos de agenda (F8): puntuales (`once`, instantes absolutos) o semanales (`weekly`, días de la
// semana dentro de un periodo y un tramo de horas locales). Se expanden a intervalos absolutos de un
// día de la clínica (Europe/Madrid), con el mismo tratamiento del cambio de hora que availability.ts.

export type ScheduleBlock =
  | {
      id: string;
      /** null = toda la clínica. */
      teamMemberId: string | null;
      kind: 'once';
      startsAt: Date;
      endsAt: Date;
      reason: string;
    }
  | {
      id: string;
      teamMemberId: string | null;
      kind: 'weekly';
      /** "AAAA-MM-DD", incluidos. */
      fromDate: string;
      untilDate: string;
      /** ISO: 1 = lunes … 7 = domingo. */
      weekdays: number[];
      /** "HH:MM" o "HH:MM:SS", hora local. */
      startTime: string;
      endTime: string;
      reason: string;
    };

/** Intervalo absoluto bloqueado. `teamMemberId` null = toda la clínica. */
export interface BlockInterval {
  blockId: string;
  teamMemberId: string | null;
  startsAt: Date;
  endsAt: Date;
}

function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Instante de una hora local. Hora inexistente → la siguiente válida; ambigua → la primera. */
export function localStart(date: Temporal.PlainDate, minutes: number): number {
  return date
    .toPlainDateTime({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
    .toZonedDateTime(CLINIC_TZ, { disambiguation: 'compatible' })
    .epochMilliseconds;
}

/** Instante de una hora local de cierre (ambigua → la primera, como closingInstant de availability). */
export function localEnd(date: Temporal.PlainDate, minutes: number): number {
  if (minutes >= 24 * 60) return date.add({ days: 1 }).toZonedDateTime({ timeZone: CLINIC_TZ }).epochMilliseconds;
  return date
    .toPlainDateTime({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
    .toZonedDateTime(CLINIC_TZ, { disambiguation: 'earlier' })
    .epochMilliseconds;
}

function dayRange(day: Temporal.PlainDate): { start: number; end: number } {
  return {
    start: day.toZonedDateTime({ timeZone: CLINIC_TZ }).epochMilliseconds,
    end: day.add({ days: 1 }).toZonedDateTime({ timeZone: CLINIC_TZ }).epochMilliseconds,
  };
}

/** Intervalos absolutos de un día ("AAAA-MM-DD") de los bloqueos que lo tocan. */
export function expandBlocks(blocks: readonly ScheduleBlock[], dayIso: string): BlockInterval[] {
  const day = Temporal.PlainDate.from(dayIso);
  const { start, end } = dayRange(day);
  const out: BlockInterval[] = [];
  for (const b of blocks) {
    if (b.kind === 'once') {
      const s = Math.max(b.startsAt.getTime(), start);
      const e = Math.min(b.endsAt.getTime(), end);
      if (s < e) out.push({ blockId: b.id, teamMemberId: b.teamMemberId, startsAt: new Date(s), endsAt: new Date(e) });
      continue;
    }
    if (dayIso < b.fromDate || dayIso > b.untilDate || !b.weekdays.includes(day.dayOfWeek)) continue;
    const s = localStart(day, toMinutes(b.startTime));
    const e = localEnd(day, toMinutes(b.endTime));
    if (s < e) out.push({ blockId: b.id, teamMemberId: b.teamMemberId, startsAt: new Date(s), endsAt: new Date(e) });
  }
  return out;
}

/** Intervalos de los días [from, from + days) (fechas de la clínica). */
export function expandBlocksRange(blocks: readonly ScheduleBlock[], fromIso: string, days: number): BlockInterval[] {
  const from = Temporal.PlainDate.from(fromIso);
  const out: BlockInterval[] = [];
  for (let i = 0; i < days; i++) out.push(...expandBlocks(blocks, from.add({ days: i }).toString()));
  return out;
}

function localDate(ms: number): Temporal.PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(CLINIC_TZ).toPlainDate();
}

/** ¿El bloqueo se solapa con el rango absoluto [from, to)? */
export function blocksOverlapRange(block: ScheduleBlock, from: Date, to: Date): boolean {
  const f = from.getTime();
  const t = to.getTime();
  if (f >= t) return false;
  if (block.kind === 'once') return block.startsAt.getTime() < t && f < block.endsAt.getTime();
  // El rango puede cruzar varios días de la clínica: se revisa cada uno.
  let day = localDate(f);
  const last = localDate(t - 1);
  while (Temporal.PlainDate.compare(day, last) <= 0) {
    for (const i of expandBlocks([block], day.toString())) {
      if (i.startsAt.getTime() < t && f < i.endsAt.getTime()) return true;
    }
    day = day.add({ days: 1 });
  }
  return false;
}

/** Intervalos que afectan a un veterinario: los suyos y los de toda la clínica. */
export function blocksForStaff(intervals: readonly BlockInterval[], teamMemberId: string): BlockInterval[] {
  return intervals.filter((i) => i.teamMemberId === null || i.teamMemberId === teamMemberId);
}

const WEEKDAY_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** "Toda la clínica · del martes, 17 de noviembre de 2026 a las 10:00 al … a las 12:00". */
export function blockSummary(
  b: Pick<ScheduleBlock, 'kind'> & (Omit<Extract<ScheduleBlock, { kind: 'once' }>, 'id'> | Omit<Extract<ScheduleBlock, { kind: 'weekly' }>, 'id'>),
  staffName: string | null,
): string {
  const who = b.teamMemberId === null ? 'Toda la clínica' : (staffName ?? 'Veterinario');
  const at = (d: Date) => {
    const z = Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(CLINIC_TZ);
    return `${formatLongDate(z.toPlainDate().toString())} a las ${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}`;
  };
  if (b.kind === 'once') return `${who} · del ${at(b.startsAt)} al ${at(b.endsAt)}`;
  const days = [...b.weekdays].sort().map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
  return `${who} · ${days}, de ${b.startTime.slice(0, 5)} a ${b.endTime.slice(0, 5)}, del ${formatLongDate(b.fromDate)} al ${formatLongDate(b.untilDate)}`;
}