import { describe, expect, it } from 'vitest';
import { blocksOverlapRange, blocksForStaff, expandBlocks, expandBlocksRange, type ScheduleBlock } from '@/domain/blocks';

// Bloqueos de agenda (F8): expansión a intervalos de un día en Europe/Madrid.

const once = (startsAt: string, endsAt: string, teamMemberId: string | null = 'a'): ScheduleBlock => ({
  id: 'b1',
  teamMemberId,
  kind: 'once',
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  reason: 'Vacaciones',
});

const weekly = (over: Partial<Extract<ScheduleBlock, { kind: 'weekly' }>> = {}): ScheduleBlock => ({
  id: 'b2',
  teamMemberId: 'a',
  kind: 'weekly',
  fromDate: '2026-11-16',
  untilDate: '2026-11-30',
  weekdays: [1, 2, 3, 4, 5],
  startTime: '11:00',
  endTime: '11:30',
  reason: 'Descanso',
  ...over,
});

describe('expandBlocks', () => {
  it('un bloqueo puntual de varios días se recorta a cada día', () => {
    // Del lunes 16 a las 00:00 al miércoles 18 a las 00:00 (Madrid, UTC+1).
    const b = once('2026-11-15T23:00:00Z', '2026-11-17T23:00:00Z');
    const day16 = expandBlocks([b], '2026-11-16');
    expect(day16).toHaveLength(1);
    expect(day16[0]!.startsAt.toISOString()).toBe('2026-11-15T23:00:00.000Z');
    expect(day16[0]!.endsAt.toISOString()).toBe('2026-11-16T23:00:00.000Z');
    expect(expandBlocks([b], '2026-11-17')).toHaveLength(1);
    expect(expandBlocks([b], '2026-11-18')).toHaveLength(0);
  });

  it('un bloqueo semanal solo cuenta los días de la semana elegidos y dentro del periodo', () => {
    const b = weekly();
    const tuesday = expandBlocks([b], '2026-11-17');
    expect(tuesday).toHaveLength(1);
    expect(tuesday[0]!.startsAt.toISOString()).toBe('2026-11-17T10:00:00.000Z');
    expect(tuesday[0]!.endsAt.toISOString()).toBe('2026-11-17T10:30:00.000Z');
    expect(expandBlocks([b], '2026-11-21')).toHaveLength(0); // sábado
    expect(expandBlocks([b], '2026-12-01')).toHaveLength(0); // después del periodo
    expect(expandBlocks([b], '2026-11-13')).toHaveLength(0); // antes del periodo
  });

  it('un semanal no cruza la medianoche: el tramo acaba el mismo día', () => {
    const b = weekly({ startTime: '20:00', endTime: '23:55' });
    const [i] = expandBlocks([b], '2026-11-17');
    expect(i!.endsAt.toISOString()).toBe('2026-11-17T22:55:00.000Z');
    expect(expandBlocks([b], '2026-11-18')[0]!.startsAt.toISOString()).toBe('2026-11-18T19:00:00.000Z');
  });

  it('el día del cambio de hora de primavera usa el desfase de cada hora', () => {
    // Domingo 28/03/2027: a las 02:00 pasan a ser las 03:00 (UTC+1 → UTC+2).
    const b = weekly({ fromDate: '2027-03-22', untilDate: '2027-03-31', weekdays: [7], startTime: '01:00', endTime: '04:00' });
    const [i] = expandBlocks([b], '2027-03-28');
    expect(i!.startsAt.toISOString()).toBe('2027-03-28T00:00:00.000Z');
    expect(i!.endsAt.toISOString()).toBe('2027-03-28T02:00:00.000Z');
  });

  it('el día del cambio de hora de otoño: una hora ambigua de fin toma la primera', () => {
    // Domingo 25/10/2026: a las 03:00 vuelven a ser las 02:00 (UTC+2 → UTC+1).
    const b = weekly({ fromDate: '2026-10-19', untilDate: '2026-10-31', weekdays: [7], startTime: '01:00', endTime: '02:30' });
    const [i] = expandBlocks([b], '2026-10-25');
    expect(i!.startsAt.toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(i!.endsAt.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('expandBlocksRange y blocksForStaff', () => {
    const blocks = [weekly(), once('2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z', null)];
    const all = expandBlocksRange(blocks, '2026-11-16', 7);
    expect(all).toHaveLength(6); // 5 laborables + 1 puntual
    expect(blocksForStaff(all, 'a')).toHaveLength(6);
    expect(blocksForStaff(all, 'z')).toHaveLength(1); // solo el de la clínica
  });
});

describe('blocksOverlapRange', () => {
  it('puntual', () => {
    const b = once('2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z');
    expect(blocksOverlapRange(b, new Date('2026-11-17T09:30:00Z'), new Date('2026-11-17T09:45:00Z'))).toBe(true);
    expect(blocksOverlapRange(b, new Date('2026-11-17T10:00:00Z'), new Date('2026-11-17T10:30:00Z'))).toBe(false);
  });

  it('semanal, también en un rango de varios días', () => {
    const b = weekly();
    expect(blocksOverlapRange(b, new Date('2026-11-17T10:15:00Z'), new Date('2026-11-17T10:45:00Z'))).toBe(true);
    expect(blocksOverlapRange(b, new Date('2026-11-17T10:30:00Z'), new Date('2026-11-17T11:00:00Z'))).toBe(false);
    expect(blocksOverlapRange(b, new Date('2026-11-21T00:00:00Z'), new Date('2026-11-24T00:00:00Z'))).toBe(true);
    expect(blocksOverlapRange(b, new Date('2026-11-21T00:00:00Z'), new Date('2026-11-22T22:00:00Z'))).toBe(false);
  });
});
