import { describe, expect, it } from 'vitest';
import { inZone, isSpanishPostalCode } from '@/domain/shipping';

describe('isSpanishPostalCode', () => {
  it('acepta códigos de 01 a 52', () => {
    expect(isSpanishPostalCode('28001')).toBe(true);
    expect(isSpanishPostalCode('01001')).toBe(true);
    expect(isSpanishPostalCode('52006')).toBe(true);
  });

  it('rechaza los que no son válidos', () => {
    for (const bad of ['00001', '53000', '2800', '28 001', 'ABCDE', '280011', '']) {
      expect(isSpanishPostalCode(bad)).toBe(false);
    }
  });
});

describe('inZone', () => {
  const peninsula = Array.from({ length: 50 }, (_, i) => String(i + 1).padStart(2, '0')).filter(
    (p) => !['07', '35', '38'].includes(p),
  );

  it('prefijos nulos = toda España', () => {
    expect(inZone('35001', null)).toBe(true);
    expect(inZone('28001', null)).toBe(true);
  });

  it('respeta una lista peninsular', () => {
    expect(inZone('28001', peninsula)).toBe(true);
    expect(inZone('35001', peninsula)).toBe(false);
    expect(inZone('07001', peninsula)).toBe(false);
  });

  it('un código no válido nunca está en la zona', () => {
    expect(inZone('99999', null)).toBe(false);
  });
});
