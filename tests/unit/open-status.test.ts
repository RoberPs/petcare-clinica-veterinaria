import { describe, expect, it } from 'vitest';
import { getOpenStatus, type WeeklySlot } from '@/domain/open-status';

// Lunes a viernes con horario partido; sábado de mañana; domingo cerrado.
const week: WeeklySlot[] = [];
for (let d = 1; d <= 5; d++) {
  week.push({ weekday: d, opensAt: '09:30', closesAt: '14:00' }, { weekday: d, opensAt: '16:30:00', closesAt: '20:00:00' });
}
week.push({ weekday: 6, opensAt: '10:00', closesAt: '14:00' });

// 2026-11-10 es martes. En noviembre Madrid está en UTC+1.
const madrid = (iso: string) => new Date(iso);

describe('getOpenStatus', () => {
  it('abierto en el primer tramo de un día partido', () => {
    const s = getOpenStatus(madrid('2026-11-10T10:00:00+01:00'), week, []);
    expect(s).toEqual({ state: 'open', closesAt: { date: '2026-11-10', time: '14:00', weekday: 2, daysFromToday: 0 } });
  });

  it('cerrado en la pausa del mediodía: abre el mismo día por la tarde', () => {
    const s = getOpenStatus(madrid('2026-11-10T15:00:00+01:00'), week, []);
    expect(s).toEqual({ state: 'closed', opensAt: { date: '2026-11-10', time: '16:30', weekday: 2, daysFromToday: 0 } });
  });

  it('a la hora exacta de cierre ya está cerrado', () => {
    const s = getOpenStatus(madrid('2026-11-10T20:00:00+01:00'), week, []);
    expect(s.state).toBe('closed');
    if (s.state === 'closed') expect(s.opensAt?.date).toBe('2026-11-11');
  });

  it('el domingo está cerrado y abre el lunes', () => {
    const s = getOpenStatus(madrid('2026-11-15T11:00:00+01:00'), week, []);
    expect(s).toEqual({ state: 'closed', opensAt: { date: '2026-11-16', time: '09:30', weekday: 1, daysFromToday: 1 } });
  });

  it('un cierre excepcional de varios días prevalece sobre el horario', () => {
    const closures = [{ startsOn: '2026-11-10', endsOn: '2026-11-12' }];
    const s = getOpenStatus(madrid('2026-11-10T10:00:00+01:00'), week, closures);
    expect(s).toEqual({ state: 'closed', opensAt: { date: '2026-11-13', time: '09:30', weekday: 5, daysFromToday: 3 } });
  });

  it('cambio de hora de marzo (domingo 29): el lunes abre a las 09:30 en hora de verano', () => {
    const s = getOpenStatus(madrid('2026-03-29T12:00:00+02:00'), week, []);
    expect(s).toEqual({ state: 'closed', opensAt: { date: '2026-03-30', time: '09:30', weekday: 1, daysFromToday: 1 } });
    // 09:45 del lunes en verano es 07:45 UTC.
    const open = getOpenStatus(new Date('2026-03-30T07:45:00Z'), week, []);
    expect(open.state).toBe('open');
  });

  it('cambio de hora de octubre (domingo 25): 09:45 del lunes es 08:45 UTC', () => {
    expect(getOpenStatus(new Date('2026-10-26T08:45:00Z'), week, []).state).toBe('open');
    expect(getOpenStatus(new Date('2026-10-26T08:15:00Z'), week, []).state).toBe('closed');
  });

  it('un horario que cruza el cambio de hora sigue siendo exacto la noche del sábado', () => {
    const s = getOpenStatus(madrid('2026-10-24T21:00:00+02:00'), week, []);
    expect(s).toEqual({ state: 'closed', opensAt: { date: '2026-10-26', time: '09:30', weekday: 1, daysFromToday: 2 } });
  });

  it('sin ningún tramo en 14 días: cerrado y sin fecha de apertura', () => {
    const closures = [{ startsOn: '2026-11-01', endsOn: '2026-12-31' }];
    expect(getOpenStatus(madrid('2026-11-10T10:00:00+01:00'), week, closures)).toEqual({ state: 'closed', opensAt: null });
    expect(getOpenStatus(madrid('2026-11-10T10:00:00+01:00'), [], [])).toEqual({ state: 'closed', opensAt: null });
  });
});
