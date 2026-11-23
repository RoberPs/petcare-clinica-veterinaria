import { Temporal } from '@js-temporal/polyfill';
import { localDateTime, parseIsoDate, staffWindows } from './availability';
import { blocksForStaff, expandBlocks, type ScheduleBlock } from './blocks';
import type { ClosureRange, WeeklySlot } from './open-status';
import { isOutsideSchedule } from './outside-schedule';
import { staffSlug } from './admin-schemas';

// Vista de la agenda del panel (US2, F9, F16): función pura sobre las citas del periodo, el horario
// de la clínica y de cada veterinario, los cierres y los bloqueos. Las marcas "Fuera de horario"
// usan las mismas ventanas que la reserva pública (F7).

export type AgendaView = 'dia' | 'semana';

export interface AgendaParams {
  view: AgendaView;
  /** "AAAA-MM-DD": el día elegido (en la semana, cualquier día de ella). */
  date: string;
  /** Slug del veterinario, o null = todos. */
  staff: string | null;
  includeCancelled: boolean;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Parámetros GET de la agenda. Un valor no válido cae al de por defecto (F16). */
export function parseAgendaParams(searchParams: SearchParams, today: string): AgendaParams {
  const vista = first(searchParams.vista);
  const fecha = first(searchParams.fecha);
  const vet = first(searchParams.veterinario);
  const date = fecha && parseIsoDate(fecha) ? fecha : today;
  return {
    view: vista === 'semana' ? 'semana' : 'dia',
    date,
    staff: vet && staffSlug.safeParse(vet).success ? vet : null,
    includeCancelled: first(searchParams.canceladas) === '1',
  };
}

/** Lunes de la semana de una fecha. */
export function weekStart(dateIso: string): string {
  const d = Temporal.PlainDate.from(dateIso);
  return d.subtract({ days: d.dayOfWeek - 1 }).toString();
}

/** Primer día y número de días del periodo de la vista. */
export function agendaRange(p: Pick<AgendaParams, 'view' | 'date'>): { from: string; days: number } {
  return p.view === 'semana' ? { from: weekStart(p.date), days: 7 } : { from: p.date, days: 1 };
}

/** Fecha del periodo anterior o siguiente. */
export function shiftAgenda(p: Pick<AgendaParams, 'view' | 'date'>, direction: -1 | 1): string {
  const d = Temporal.PlainDate.from(p.view === 'semana' ? weekStart(p.date) : p.date);
  return d.add({ days: direction * (p.view === 'semana' ? 7 : 1) }).toString();
}

/** URL de la agenda con los parámetros (los de por defecto no se escriben). */
export function agendaHref(p: AgendaParams, overrides: Partial<AgendaParams> = {}): string {
  const q = { ...p, ...overrides };
  const params = new URLSearchParams();
  if (q.view === 'semana') params.set('vista', 'semana');
  params.set('fecha', q.date);
  if (q.staff) params.set('veterinario', q.staff);
  if (q.includeCancelled) params.set('canceladas', '1');
  return `/admin/agenda?${params.toString()}`;
}

export interface AgendaAppointment {
  id: string;
  teamMemberId: string;
  startsAt: Date;
  endsAt: Date;
  status: 'confirmed' | 'cancelled';
  serviceName: string;
  servicePublished: boolean;
  petName: string;
  petSpeciesLabel: string;
  /** null si la cita está anonimizada. */
  ownerName: string | null;
}

export interface AgendaStaff {
  id: string;
  slug: string;
  name: string;
}

export type AppointmentState = 'confirmada' | 'cancelada' | 'realizada';

export interface AgendaItem {
  id: string;
  start: string;
  end: string;
  startsAt: Date;
  serviceName: string;
  serviceInactive: boolean;
  petName: string;
  petSpeciesLabel: string;
  ownerName: string | null;
  state: AppointmentState;
  outsideSchedule: boolean;
}

export interface AgendaBlock {
  id: string;
  start: string;
  end: string;
  reason: string;
  clinicWide: boolean;
}

export interface AgendaRangeLocal {
  start: string;
  end: string;
}

export interface AgendaDay {
  date: string;
  /** Cierre de la clínica o sin horario general ese día. */
  clinicClosed: boolean;
  /** Tramos en que atiende (clínica ∩ veterinario), antes de los bloqueos. */
  hours: AgendaRangeLocal[];
  /** Tramos de la clínica en los que el veterinario no tiene horario. */
  off: AgendaRangeLocal[];
  blocks: AgendaBlock[];
  items: AgendaItem[];
}

export interface AgendaColumn {
  staff: AgendaStaff;
  days: AgendaDay[];
}

export interface BuildAgendaInput {
  appointments: readonly AgendaAppointment[];
  staff: readonly AgendaStaff[];
  clinicHours: readonly WeeklySlot[];
  staffHours: ReadonlyMap<string, readonly WeeklySlot[]>;
  closures: readonly ClosureRange[];
  blocks: readonly ScheduleBlock[];
  from: string;
  days: number;
  now: Date;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function ranges(slots: readonly WeeklySlot[], weekday: number): [number, number][] {
  return slots
    .filter((s) => s.weekday === weekday)
    .map((s) => [toMin(s.opensAt), toMin(s.closesAt)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

function intersect(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [ao, ac] of a) for (const [bo, bc] of b) if (Math.max(ao, bo) < Math.min(ac, bc)) out.push([Math.max(ao, bo), Math.min(ac, bc)]);
  return out.sort((x, y) => x[0] - y[0]);
}

function minus(a: [number, number][], b: [number, number][]): [number, number][] {
  let cur = a;
  for (const [co, cc] of b) {
    const next: [number, number][] = [];
    for (const [o, c] of cur) {
      if (cc <= o || co >= c) next.push([o, c]);
      else {
        if (co > o) next.push([o, co]);
        if (cc < c) next.push([cc, c]);
      }
    }
    cur = next;
  }
  return cur;
}

function stateOf(a: AgendaAppointment, now: Date): AppointmentState {
  if (a.status === 'cancelled') return 'cancelada';
  return a.endsAt.getTime() <= now.getTime() ? 'realizada' : 'confirmada';
}

/** Hora local "HH:MM" del fin de un intervalo que acaba a medianoche: "24:00". */
function localEndTime(at: Date, day: string): string {
  const l = localDateTime(at);
  return l.date > day ? '24:00' : l.time;
}

export function buildAgenda(input: BuildAgendaInput): AgendaColumn[] {
  const from = Temporal.PlainDate.from(input.from);
  const dates = Array.from({ length: input.days }, (_, i) => from.add({ days: i }).toString());
  const expanded = new Map(dates.map((d) => [d, expandBlocks(input.blocks, d)]));
  const reasons = new Map(input.blocks.map((b) => [b.id, b.reason]));

  return input.staff.map((member) => {
    const hours = input.staffHours.get(member.id) ?? [];
    const days = dates.map((date): AgendaDay => {
      const weekday = Temporal.PlainDate.from(date).dayOfWeek;
      const clinic = ranges(input.clinicHours, weekday);
      const closed = clinic.length === 0 || input.closures.some((c) => c.startsOn <= date && date <= c.endsOn);
      const works = closed ? [] : intersect(clinic, ranges(hours, weekday));
      const off = closed ? [] : minus(clinic, works);
      const dayBlocks = blocksForStaff(expanded.get(date) ?? [], member.id);
      const windows = staffWindows({ clinicHours: input.clinicHours, staffHours: hours, closures: input.closures, blocks: dayBlocks, day: date });
      const items = input.appointments
        .filter((a) => a.teamMemberId === member.id && localDateTime(a.startsAt).date === date)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map((a) => ({
          id: a.id,
          start: localDateTime(a.startsAt).time,
          end: localEndTime(a.endsAt, date),
          startsAt: a.startsAt,
          serviceName: a.serviceName,
          serviceInactive: !a.servicePublished,
          petName: a.petName,
          petSpeciesLabel: a.petSpeciesLabel,
          ownerName: a.ownerName,
          state: stateOf(a, input.now),
          outsideSchedule: isOutsideSchedule(a, windows, input.now),
        }));
      return {
        date,
        clinicClosed: closed,
        hours: works.map(([o, c]) => ({ start: hhmm(o), end: hhmm(c) })),
        off: off.map(([o, c]) => ({ start: hhmm(o), end: hhmm(c) })),
        blocks: dayBlocks
          .map((b) => ({
            id: b.blockId,
            start: localDateTime(b.startsAt).time,
            end: localEndTime(b.endsAt, date),
            reason: reasons.get(b.blockId) ?? '',
            clinicWide: b.teamMemberId === null,
          }))
          .sort((a, b) => a.start.localeCompare(b.start)),
        items,
      };
    });
    return { staff: member, days };
  });
}

/** Etiqueta del estado de una cita. */
export const STATE_LABEL: Record<AppointmentState, string> = {
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  realizada: 'Realizada',
};
