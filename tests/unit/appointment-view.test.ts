import { describe, expect, it } from 'vitest';
import { appointmentView } from '@/domain/appointment-view';

const START = new Date('2026-11-20T09:00:00Z');
const END = new Date('2026-11-20T09:30:00Z');
const row = (status: 'confirmed' | 'cancelled' = 'confirmed') => ({ status, startsAt: START, endsAt: END });
const hoursBefore = (h: number) => new Date(START.getTime() - h * 3_600_000);

describe('appointmentView', () => {
  it('confirmada y con margen: se puede cambiar', () => {
    expect(appointmentView(row(), hoursBefore(48), 24)).toEqual({ state: 'confirmed', upcoming: true, canChange: true });
  });

  it('justo a 24 h todavía se puede; un segundo después ya no', () => {
    expect(appointmentView(row(), hoursBefore(24), 24).canChange).toBe(true);
    const oneSecondLate = new Date(hoursBefore(24).getTime() + 1000);
    expect(appointmentView(row(), oneSecondLate, 24)).toEqual({ state: 'confirmed', upcoming: true, canChange: false });
  });

  it('cancelada: nunca se puede cambiar', () => {
    expect(appointmentView(row('cancelled'), hoursBefore(48), 24)).toEqual({ state: 'cancelled', upcoming: false, canChange: false });
  });

  it('en curso: confirmada pero no próxima', () => {
    expect(appointmentView(row(), new Date('2026-11-20T09:10:00Z'), 24)).toEqual({
      state: 'confirmed',
      upcoming: false,
      canChange: false,
    });
  });

  it('terminada: realizada', () => {
    expect(appointmentView(row(), END, 24).state).toBe('done');
  });

  it('con plazo 0 se puede cambiar hasta el inicio', () => {
    expect(appointmentView(row(), new Date(START.getTime() - 1000), 0).canChange).toBe(true);
  });
});
