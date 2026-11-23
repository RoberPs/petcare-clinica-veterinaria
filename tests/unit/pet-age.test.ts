import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';
import { petAge, todayInClinicZone } from '@/domain/pet-age';

const d = (iso: string) => Temporal.PlainDate.from(iso);

describe('edad de la mascota (A10)', () => {
  it('en años a partir del primer cumpleaños', () => {
    expect(petAge(d('2022-08-01'), d('2026-11-11'))).toBe('4 años');
    expect(petAge(d('2025-11-11'), d('2026-11-11'))).toBe('1 año');
  });

  it('el día exacto del cumpleaños ya cuenta, y el día anterior todavía no', () => {
    expect(petAge(d('2024-11-11'), d('2026-11-11'))).toBe('2 años');
    expect(petAge(d('2024-11-12'), d('2026-11-11'))).toBe('1 año');
    expect(petAge(d('2025-11-12'), d('2026-11-11'))).toBe('11 meses');
  });

  it('en meses si tiene menos de un año', () => {
    expect(petAge(d('2026-06-11'), d('2026-11-11'))).toBe('5 meses');
    expect(petAge(d('2026-10-11'), d('2026-11-11'))).toBe('1 mes');
  });

  it('"Menos de 1 mes" para las recién nacidas (y por seguridad si la fecha fuese futura)', () => {
    expect(petAge(d('2026-10-12'), d('2026-11-11'))).toBe('Menos de 1 mes');
    expect(petAge(d('2026-11-11'), d('2026-11-11'))).toBe('Menos de 1 mes');
    expect(petAge(d('2026-11-12'), d('2026-11-11'))).toBe('Menos de 1 mes');
  });

  it('los nacidos el 29 de febrero cumplen el 28 de febrero en los años no bisiestos', () => {
    expect(petAge(d('2024-02-29'), d('2025-02-27'))).toBe('11 meses');
    expect(petAge(d('2024-02-29'), d('2025-02-28'))).toBe('1 año');
    expect(petAge(d('2024-02-29'), d('2028-02-28'))).toBe('3 años');
    expect(petAge(d('2024-02-29'), d('2028-02-29'))).toBe('4 años');
  });

  it('el día de hoy se calcula en Europe/Madrid', () => {
    // 23:30 UTC del 10 de noviembre ya es 11 de noviembre en Madrid (UTC+1).
    expect(todayInClinicZone(new Date('2026-11-10T23:30:00Z')).toString()).toBe('2026-11-11');
    expect(todayInClinicZone(() => new Date('2026-07-01T21:59:00Z')).toString()).toBe('2026-07-01');
    expect(todayInClinicZone(() => new Date('2026-07-01T22:00:00Z')).toString()).toBe('2026-07-02');
  });
});
