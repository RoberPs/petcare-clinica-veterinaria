import { describe, expect, it } from 'vitest';
import { cartTotals, discountAmount, splitDiscount, vatIncluded } from '@/domain/pricing';

const FREE = { costCents: 0, vatRate: 21 };

describe('vatIncluded (IVA contenido, D5)', () => {
  it('neto − round(neto / (1 + tipo)) con los tipos 4, 10 y 21', () => {
    expect(vatIncluded(1210, 21)).toBe(210);
    expect(vatIncluded(1100, 10)).toBe(100);
    expect(vatIncluded(1040, 4)).toBe(40);
    expect(vatIncluded(1995, 21)).toBe(1995 - Math.round(1995 / 1.21));
    expect(vatIncluded(999, 10)).toBe(999 - 908);
    expect(vatIncluded(500, 0)).toBe(0);
    expect(vatIncluded(0, 21)).toBe(0);
  });
});

describe('discountAmount', () => {
  it('porcentaje con redondeo de la mitad hacia arriba', () => {
    expect(discountAmount(1995, { kind: 'percent', value: 10 })).toBe(200);
    expect(discountAmount(1985, { kind: 'percent', value: 10 })).toBe(199);
    expect(discountAmount(1000, { kind: 'percent', value: 100 })).toBe(1000);
  });

  it('importe fijo nunca mayor que el subtotal', () => {
    expect(discountAmount(3000, { kind: 'fixed', value: 500 })).toBe(500);
    expect(discountAmount(300, { kind: 'fixed', value: 500 })).toBe(300);
    expect(discountAmount(1000, null)).toBe(0);
  });
});

describe('splitDiscount (mayor resto)', () => {
  it('suma exactamente el descuento con un céntimo de resto', () => {
    const shares = splitDiscount([1000, 1000, 1000], 100);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });

  it('proporcional al importe de cada línea', () => {
    const shares = splitDiscount([3000, 1000], 400);
    expect(shares).toEqual([300, 100]);
  });

  it('sin importe, todo a cero', () => {
    expect(splitDiscount([0, 0], 0)).toEqual([0, 0]);
    expect(splitDiscount([], 0)).toEqual([]);
  });

  it('nunca supera el importe de la línea', () => {
    const shares = splitDiscount([1, 999], 1000);
    expect(shares).toEqual([1, 999]);
  });
});

describe('cartTotals', () => {
  const lines = [
    { unitPriceCents: 1995, quantity: 2, vatRate: 21 },
    { unitPriceCents: 450, quantity: 1, vatRate: 10 },
  ];

  it('subtotal de varias líneas, envío gratis, total e IVA', () => {
    const t = cartTotals(lines, null, FREE);
    expect(t.subtotalCents).toBe(4440);
    expect(t.discountCents).toBe(0);
    expect(t.shippingCents).toBe(0);
    expect(t.totalCents).toBe(4440);
    expect(t.vatCents).toBe(vatIncluded(3990, 21) + vatIncluded(450, 10));
  });

  it('el descuento nunca toca el envío', () => {
    const t = cartTotals(lines, { kind: 'fixed', value: 10_000 }, { costCents: 495, vatRate: 21 });
    expect(t.discountCents).toBe(4440);
    expect(t.totalCents).toBe(495);
    expect(t.vatCents).toBe(vatIncluded(495, 21));
  });

  it('importe fijo mayor que el subtotal deja el total en 0 sin envío', () => {
    const t = cartTotals(lines, { kind: 'fixed', value: 99_999 }, FREE);
    expect(t.totalCents).toBe(0);
    expect(t.vatCents).toBe(0);
  });

  it('IVA del envío con coste', () => {
    const t = cartTotals(lines, null, { costCents: 605, vatRate: 21 });
    expect(t.totalCents).toBe(4440 + 605);
    expect(t.vatCents).toBe(vatIncluded(3990, 21) + vatIncluded(450, 10) + vatIncluded(605, 21));
  });

  it('reparte el descuento por línea y el IVA se calcula sobre el neto', () => {
    const t = cartTotals(lines, { kind: 'percent', value: 10 }, FREE);
    expect(t.discountCents).toBe(444);
    const shares = t.lines.map((l) => l.discountShareCents);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(444);
    expect(t.lines[0]!.netCents).toBe(3990 - shares[0]!);
    expect(t.vatCents).toBe(t.lines.reduce((a, l) => a + l.vatCents, 0));
    expect(t.totalCents).toBe(4440 - 444);
  });

  it('las líneas no disponibles quedan fuera del total', () => {
    const t = cartTotals([...lines, { unitPriceCents: 5000, quantity: 1, vatRate: 21, unavailable: true }], null, FREE);
    expect(t.subtotalCents).toBe(4440);
    expect(t.lines[2]).toMatchObject({ grossCents: 0, netCents: 0, vatCents: 0, discountShareCents: 0 });
    expect(t.units).toBe(3);
  });
});
