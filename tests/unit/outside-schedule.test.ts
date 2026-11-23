import { describe, expect, it } from 'vitest';
import type { ScheduleBlock } from '@/domain/blocks';
import { countAffected, isOutsideSchedule, windowsResolver } from '@/domain/outside-schedule';

// "Fuera de horario" (F9) y citas afectadas por un cambio (FR-014, FR-019, FR-028).

const NOW = new Date('2026-11-16T08:00:00Z'); // lunes 09:00 en Madrid
const HOURS = [{ weekday: 2, opensAt: '09:30', closesAt: '14:00' }];

const appt = (id: string, startIso: string, minutes = 30, status: 'confirmed' | 'cancelled' = 'confirmed') => ({
  id,
  teamMemberId: 'a',
  startsAt: new Date(startIso),
  endsAt: new Date(new Date(startIso).getTime() + minutes * 60_000),
  status,
});

describe('isOutsideSchedule', () => {
  const windows = [{ start: new Date('2026-11-17T08:30:00Z'), end: new Date('2026-11-17T13:00:00Z') }];
  it('dentro de una ventana: no', () => {
    expect(isOutsideSchedule(appt('1', '2026-11-17T09:00:00Z'), windows, NOW)).toBe(false);
  });
  it('se sale por el final: sí', () => {
    expect(isOutsideSchedule(appt('1', '2026-11-17T12:45:00Z'), windows, NOW)).toBe(true);
  });
  it('las pasadas y las canceladas nunca están fuera de horario', () => {
    expect(isOutsideSchedule(appt('1', '2026-11-15T12:45:00Z'), [], NOW)).toBe(false);
    expect(isOutsideSchedule(appt('1', '2026-11-17T20:00:00Z', 30, 'cancelled'), windows, NOW)).toBe(false);
  });
});

describe('countAffected', () => {
  it('cuenta las que pasan de dentro a fuera con un bloqueo', () => {
    const block: ScheduleBlock = {
      id: 'b',
      teamMemberId: null,
      kind: 'once',
      startsAt: new Date('2026-11-17T09:00:00Z'),
      endsAt: new Date('2026-11-17T10:00:00Z'),
      reason: 'Formación',
    };
    const base = { clinicHours: HOURS, staffHours: new Map([['a', HOURS]]), closures: [] };
    const before = windowsResolver({ ...base, blocks: [] });
    const after = windowsResolver({ ...base, blocks: [block] });
    const appts = [
      appt('dentro', '2026-11-17T09:30:00Z'), // 10:30 local: bloqueada
      appt('libre', '2026-11-17T11:00:00Z'), // 12:00 local
      appt('ya-fuera', '2026-11-17T14:00:00Z'), // 15:00 local: ya estaba fuera
    ];
    expect(countAffected(appts, before, after, NOW)).toEqual({ count: 1, ids: ['dentro'] });
  });

  it('un veterinario sin tramos deja fuera todas sus citas futuras', () => {
    const before = windowsResolver({ clinicHours: HOURS, staffHours: new Map([['a', HOURS]]), closures: [], blocks: [] });
    const after = windowsResolver({ clinicHours: HOURS, staffHours: new Map(), closures: [], blocks: [] });
    expect(countAffected([appt('x', '2026-11-17T09:00:00Z')], before, after, NOW).count).toBe(1);
  });
});
