import { describe, expect, it } from 'vitest';
import { outsideClinic, validateWeek, type WeekInput } from '@/domain/staff-schedule';

// Rejilla semanal del horario de un veterinario (F6, FR-016, FR-019).

const empty = { opens: '', closes: '' };
function week(day: number, ranges: { opens: string; closes: string }[]): WeekInput {
  return Array.from({ length: 7 }, (_, i) => (i === day - 1 ? ranges : [empty, empty, empty]));
}

describe('validateWeek', () => {
  it('acepta hasta 3 tramos por día y devuelve los tramos ordenados', () => {
    const r = validateWeek(
      week(2, [
        { opens: '16:00', closes: '19:00' },
        { opens: '09:00', closes: '13:00' },
        empty,
      ]),
    );
    expect(r).toEqual({
      ok: true,
      slots: [
        { weekday: 2, opensAt: '09:00', closesAt: '13:00' },
        { weekday: 2, opensAt: '16:00', closesAt: '19:00' },
      ],
    });
  });

  it('una semana vacía es válida (veterinario sin horario)', () => {
    expect(validateWeek(Array.from({ length: 7 }, () => [empty]))).toEqual({ ok: true, slots: [] });
  });

  it('errores por día.tramo.campo', () => {
    const r = validateWeek(
      week(1, [
        { opens: '09:02', closes: '10:00' },
        { opens: '12:00', closes: '11:00' },
        { opens: '9', closes: '' },
      ]),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors['1.0.opens']).toMatch(/múltiplos de 5/);
    expect(r.errors['1.1.closes']).toMatch(/posterior/);
    expect(r.errors['1.2.opens']).toMatch(/HH:MM/);
    expect(r.errors['1.2.closes']).toMatch(/fin/);
  });

  it('tramos solapados', () => {
    const r = validateWeek(
      week(3, [
        { opens: '09:00', closes: '12:00' },
        { opens: '11:30', closes: '13:00' },
      ]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors['3.1.opens']).toMatch(/solapa/);
  });

  it('más de 3 tramos', () => {
    const r = validateWeek(
      week(4, [
        { opens: '08:00', closes: '09:00' },
        { opens: '10:00', closes: '11:00' },
        { opens: '12:00', closes: '13:00' },
        { opens: '14:00', closes: '15:00' },
      ]),
    );
    expect(r.ok).toBe(false);
  });
});

describe('outsideClinic', () => {
  const clinic = [
    { weekday: 2, opensAt: '09:30', closesAt: '14:00' },
    { weekday: 2, opensAt: '16:30', closesAt: '20:00' },
  ];
  it('devuelve los tramos que no caben en el horario de la clínica', () => {
    const out = outsideClinic(
      [
        { weekday: 2, opensAt: '10:00', closesAt: '13:00' },
        { weekday: 2, opensAt: '13:00', closesAt: '17:00' },
        { weekday: 6, opensAt: '10:00', closesAt: '12:00' },
      ],
      clinic,
    );
    expect(out).toEqual([
      { weekday: 2, opensAt: '13:00', closesAt: '17:00' },
      { weekday: 6, opensAt: '10:00', closesAt: '12:00' },
    ]);
  });
});
