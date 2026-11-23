import { localDateTime, staffWindows, type TimeWindow } from './availability';
import { blocksForStaff, expandBlocks, type ScheduleBlock } from './blocks';
import type { ClosureRange, WeeklySlot } from './open-status';

// "Fuera de horario" se calcula, no se guarda (F9): una cita confirmada y futura que no cabe en las
// ventanas de su veterinario (las de F7, las mismas que ofrece la reserva pública).

export interface ScheduledAppointment {
  id: string;
  teamMemberId: string;
  startsAt: Date;
  endsAt: Date;
  status: 'confirmed' | 'cancelled';
}

/** Ventanas de un veterinario el día (de la clínica) en que empieza la cita. */
export type WindowsFor = (teamMemberId: string, startsAt: Date) => readonly TimeWindow[];

export function isOutsideSchedule(
  appt: Omit<ScheduledAppointment, 'id' | 'teamMemberId'>,
  windows: readonly TimeWindow[],
  now: Date = new Date(),
): boolean {
  if (appt.status !== 'confirmed' || appt.startsAt.getTime() <= now.getTime()) return false;
  const s = appt.startsAt.getTime();
  const e = appt.endsAt.getTime();
  return !windows.some((w) => w.start.getTime() <= s && e <= w.end.getTime());
}

/**
 * Citas que pasarían a estar fuera de horario con un cambio (de horario, de bloqueos…): dentro con
 * las ventanas de antes y fuera con las de después (FR-014, FR-019, FR-028).
 */
export function countAffected(
  appts: readonly ScheduledAppointment[],
  windowsBefore: WindowsFor,
  windowsAfter: WindowsFor,
  now: Date = new Date(),
): { count: number; ids: string[] } {
  const ids = appts
    .filter(
      (a) =>
        !isOutsideSchedule(a, windowsBefore(a.teamMemberId, a.startsAt), now) &&
        isOutsideSchedule(a, windowsAfter(a.teamMemberId, a.startsAt), now),
    )
    .map((a) => a.id)
    .sort();
  return { count: ids.length, ids };
}

export interface ScheduleSnapshot {
  clinicHours: readonly WeeklySlot[];
  /** Horario de cada veterinario por id. Un id ausente = sin tramos. */
  staffHours: ReadonlyMap<string, readonly WeeklySlot[]>;
  closures: readonly ClosureRange[];
  blocks: readonly ScheduleBlock[];
}

/** Resolutor de ventanas (con memoria por veterinario y día) a partir de una foto del horario. */
export function windowsResolver(s: ScheduleSnapshot): WindowsFor {
  const memo = new Map<string, readonly TimeWindow[]>();
  return (teamMemberId, startsAt) => {
    const day = localDateTime(startsAt).date;
    const key = `${teamMemberId}|${day}`;
    let w = memo.get(key);
    if (!w) {
      w = staffWindows({
        clinicHours: s.clinicHours,
        staffHours: s.staffHours.get(teamMemberId) ?? [],
        closures: s.closures,
        blocks: blocksForStaff(expandBlocks(s.blocks, day), teamMemberId),
        day,
      });
      memo.set(key, w);
    }
    return w;
  };
}
