import { describe, expect, it } from 'vitest';
import { checkoutFingerprint, clampQuantity } from '@/domain/cart-rules';

describe('clampQuantity', () => {
  const limits = { stock: 5, maxPerLine: 10 };

  it('acepta un entero dentro de los límites', () => {
    expect(clampQuantity('3', limits)).toEqual({ kind: 'ok', quantity: 3, adjusted: null });
    expect(clampQuantity(1, limits)).toEqual({ kind: 'ok', quantity: 1, adjusted: null });
  });

  it('0 significa eliminar', () => {
    expect(clampQuantity('0', limits)).toEqual({ kind: 'remove' });
  });

  it('rechaza negativos, decimales y texto', () => {
    expect(clampQuantity('-1', limits)).toEqual({ kind: 'invalid' });
    expect(clampQuantity('1.5', limits)).toEqual({ kind: 'invalid' });
    expect(clampQuantity('dos', limits)).toEqual({ kind: 'invalid' });
    expect(clampQuantity('', limits)).toEqual({ kind: 'invalid' });
    expect(clampQuantity(null, limits)).toEqual({ kind: 'invalid' });
  });

  it('acota al stock con el motivo "stock"', () => {
    expect(clampQuantity('8', limits)).toEqual({ kind: 'ok', quantity: 5, adjusted: 'stock' });
  });

  it('acota al máximo por línea con el motivo "max"', () => {
    expect(clampQuantity('15', { stock: 50, maxPerLine: 10 })).toEqual({ kind: 'ok', quantity: 10, adjusted: 'max' });
  });

  it('sin stock no hay cantidad posible', () => {
    expect(clampQuantity('1', { stock: 0, maxPerLine: 10 })).toEqual({ kind: 'out_of_stock' });
  });
});

describe('checkoutFingerprint', () => {
  const base = {
    lines: [
      { productId: 'b', quantity: 1 },
      { productId: 'a', quantity: 2 },
    ],
    shippingMethod: 'domicilio',
    discountCode: null,
  };

  it('es estable con las líneas en cualquier orden', () => {
    const reversed = { ...base, lines: [...base.lines].reverse() };
    expect(checkoutFingerprint(base)).toBe(checkoutFingerprint(reversed));
    expect(checkoutFingerprint(base)).toBe('a*2,b*1|domicilio|');
  });

  it('cambia con la cantidad, el método de envío o el código', () => {
    const fp = checkoutFingerprint(base);
    expect(checkoutFingerprint({ ...base, lines: [{ productId: 'a', quantity: 3 }, base.lines[0]!] })).not.toBe(fp);
    expect(checkoutFingerprint({ ...base, shippingMethod: 'recogida' })).not.toBe(fp);
    expect(checkoutFingerprint({ ...base, discountCode: 'BIENVENIDA10' })).not.toBe(fp);
  });

  it('sin código y con código nulo es lo mismo', () => {
    const { discountCode: _ignored, ...withoutCode } = base;
    expect(checkoutFingerprint(withoutCode)).toBe(checkoutFingerprint(base));
  });
});
