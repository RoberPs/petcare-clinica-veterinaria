import { describe, expect, it } from 'vitest';
import { discountSchema, eurosToCents, productSchema, stockAdjustSchema } from '@/domain/store-schemas';

// Esquemas de la tienda en el panel (feature 008, data-model.md "Reglas de validación").

const CAT = '11111111-1111-4111-8111-111111111111';
const PET = '22222222-2222-4222-8222-222222222222';

const valid = (over: Record<string, unknown> = {}) => ({
  name: 'Pienso de prueba',
  short_description: 'Una descripción corta suficiente.',
  description_md: 'Una descripción larga con más de veinte caracteres.',
  category_id: CAT,
  pet_ids: [PET],
  price: '12,50',
  vat_rate: '21',
  stock_initial: '5',
  position: '0',
  ...over,
});

const errorsOf = (raw: Record<string, unknown>) => {
  const r = productSchema.safeParse(raw);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('eurosToCents', () => {
  it('acepta coma o punto y como mucho dos decimales', () => {
    expect(eurosToCents('12,5')).toBe(1250);
    expect(eurosToCents('12.50')).toBe(1250);
    expect(eurosToCents('9999,99')).toBe(999_999);
    expect(eurosToCents('1,234')).toBeNull();
    expect(eurosToCents('-3')).toBeNull();
    expect(eurosToCents('doce')).toBeNull();
  });
});

describe('productSchema', () => {
  it('acepta un alta válida y devuelve céntimos', () => {
    const r = productSchema.parse(valid());
    expect(r).toMatchObject({ priceCents: 1250, compareAtCents: null, vatRate: 21, stockInitial: 5, isNew: false, published: false });
  });

  it('valida los límites de cada campo', () => {
    expect(errorsOf(valid({ name: 'A' }))).toHaveProperty('name');
    expect(errorsOf(valid({ name: 'x'.repeat(81) }))).toHaveProperty('name');
    expect(errorsOf(valid({ short_description: 'corta' }))).toHaveProperty('short_description');
    expect(errorsOf(valid({ short_description: 'x'.repeat(201) }))).toHaveProperty('short_description');
    expect(errorsOf(valid({ description_md: 'poco' }))).toHaveProperty('description_md');
    expect(errorsOf(valid({ description_md: 'x'.repeat(5001) }))).toHaveProperty('description_md');
    expect(errorsOf(valid({ ingredients_md: 'x'.repeat(3001) }))).toHaveProperty('ingredients_md');
    expect(errorsOf(valid({ price: '0' }))).toHaveProperty('price');
    expect(errorsOf(valid({ price: '10000' }))).toHaveProperty('price');
    expect(errorsOf(valid({ price: '1,999' }))).toHaveProperty('price');
    expect(errorsOf(valid({ stock_initial: '100000' }))).toHaveProperty('stock_initial');
    expect(errorsOf(valid({ stock_initial: '-1' }))).toHaveProperty('stock_initial');
    expect(errorsOf(valid({ position: '10000' }))).toHaveProperty('position');
    expect(errorsOf(valid({ category_id: '' }))).toHaveProperty('category_id');
  });

  it('el stock inicial solo es obligatorio en el alta', () => {
    expect(errorsOf(valid({ stock_initial: '' }))).toHaveProperty('stock_initial');
    expect(errorsOf(valid({ stock_initial: '', id: '33333333-3333-4333-8333-333333333333' }))).toEqual({});
  });

  it('«Oferta» exige un precio anterior mayor que el actual', () => {
    expect(errorsOf(valid({ on_sale: 'on' }))).toHaveProperty('compare_at');
    expect(errorsOf(valid({ on_sale: 'on', compare_at: '12,50' }))).toHaveProperty('compare_at');
    expect(errorsOf(valid({ on_sale: 'on', compare_at: '10' }))).toHaveProperty('compare_at');
    expect(productSchema.parse(valid({ on_sale: 'on', compare_at: '15' })).compareAtCents).toBe(1500);
    // Sin la casilla, el precio anterior se descarta.
    expect(productSchema.parse(valid({ compare_at: '15' })).compareAtCents).toBeNull();
  });

  it('exige al menos una mascota', () => {
    expect(errorsOf(valid({ pet_ids: [] }))).toHaveProperty('pet_ids');
  });

  it('exige el texto alternativo cuando queda foto', () => {
    expect(errorsOf(valid({ has_image: true }))).toHaveProperty('image_alt');
    expect(errorsOf(valid({ has_image: true, image_alt: 'ab' }))).toHaveProperty('image_alt');
    expect(errorsOf(valid({ has_image: true, image_alt: 'x'.repeat(151) }))).toHaveProperty('image_alt');
    expect(productSchema.parse(valid({ has_image: true, image_alt: 'Saco de pienso' })).imageAlt).toBe('Saco de pienso');
    expect(productSchema.parse(valid({ image_alt: 'Saco de pienso' })).imageAlt).toBeNull();
  });

  it('rechaza un IVA fuera de VAT_RATES', () => {
    expect(errorsOf(valid({ vat_rate: '7' }))).toHaveProperty('vat_rate');
    expect(errorsOf(valid({ vat_rate: 'x' }))).toHaveProperty('vat_rate');
    expect(productSchema.parse(valid({ vat_rate: '4' })).vatRate).toBe(4);
  });
});

describe('stockAdjustSchema', () => {
  const ID = '33333333-3333-4333-8333-333333333333';
  const errs = (raw: Record<string, unknown>) => {
    const r = stockAdjustSchema.safeParse({ id: ID, ...raw });
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
  };

  it('acepta sumar o restar con un motivo válido', () => {
    expect(stockAdjustSchema.parse({ id: ID, delta: '10', reason: 'restock' })).toMatchObject({ delta: 10, reason: 'restock', note: null });
    expect(stockAdjustSchema.parse({ id: ID, delta: '-3', reason: 'damage', note: ' Caja rota ' })).toMatchObject({ delta: -3, note: 'Caja rota' });
    expect(stockAdjustSchema.parse({ id: ID, delta: '+2', reason: 'count' }).delta).toBe(2);
  });

  it('delta distinto de 0, entero y dentro de los límites', () => {
    expect(errs({ delta: '0', reason: 'restock' })).toHaveProperty('delta');
    expect(errs({ delta: '1.5', reason: 'restock' })).toHaveProperty('delta');
    expect(errs({ delta: '', reason: 'restock' })).toHaveProperty('delta');
    expect(errs({ delta: '100000', reason: 'restock' })).toHaveProperty('delta');
    expect(errs({ delta: '-100000', reason: 'restock' })).toHaveProperty('delta');
    expect(errs({ delta: '99999', reason: 'restock' })).toEqual({});
  });

  it('el motivo es uno de la lista y «Otro» exige nota', () => {
    expect(errs({ delta: '1', reason: 'order_reserved' })).toHaveProperty('reason');
    expect(errs({ delta: '1', reason: 'initial' })).toHaveProperty('reason');
    expect(errs({ delta: '1', reason: 'other' })).toHaveProperty('note');
    expect(errs({ delta: '1', reason: 'other', note: 'Regalo a un cliente' })).toEqual({});
    expect(errs({ delta: '1', reason: 'count', note: 'x'.repeat(201) })).toHaveProperty('note');
  });
});

describe('discountSchema', () => {
  const errs = (raw: Record<string, unknown>) => {
    const r = discountSchema.safeParse({ kind: 'percent', value: '10', ...raw });
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
  };

  it('normaliza el código a mayúsculas sin espacios', () => {
    expect(discountSchema.parse({ code: ' verano 10 ', kind: 'percent', value: '10' })).toMatchObject({ code: 'VERANO10', value: 10 });
    expect(errs({ code: 'ab' })).toHaveProperty('code');
    expect(errs({ code: 'VERANO-10' })).toHaveProperty('code');
    expect(errs({ code: 'x'.repeat(21) })).toHaveProperty('code');
    expect(errs({ code: 'AÑO10' })).toHaveProperty('code');
  });

  it('porcentaje de 1 a 100 e importe mayor que 0', () => {
    expect(errs({ code: 'ABC', value: '0' })).toHaveProperty('value');
    expect(errs({ code: 'ABC', value: '101' })).toHaveProperty('value');
    expect(errs({ code: 'ABC', value: '12.5' })).toHaveProperty('value');
    expect(errs({ code: 'ABC', value: '100' })).toEqual({});
    expect(discountSchema.parse({ code: 'ABC', kind: 'fixed', value: '7,50' }).value).toBe(750);
    expect(errs({ code: 'ABC', kind: 'fixed', value: '0' })).toHaveProperty('value');
    expect(errs({ code: 'ABC', kind: 'otro' })).toHaveProperty('kind');
  });

  it('el fin no puede ser anterior al inicio; los opcionales son mayores que 0', () => {
    expect(errs({ code: 'ABC', starts_on: '2026-12-10', ends_on: '2026-12-09' })).toHaveProperty('ends_on');
    const same = discountSchema.parse({ code: 'ABC', kind: 'percent', value: '5', starts_on: '2026-12-10', ends_on: '2026-12-10' });
    expect(same.endsAt!.getTime()).toBeGreaterThan(same.startsAt!.getTime());
    expect(errs({ code: 'ABC', starts_on: '2026-02-30' })).toHaveProperty('starts_on');
    expect(errs({ code: 'ABC', min_subtotal: '0' })).toHaveProperty('min_subtotal');
    expect(errs({ code: 'ABC', max_uses: '0' })).toHaveProperty('max_uses');
    expect(discountSchema.parse({ code: 'ABC', kind: 'percent', value: '5', min_subtotal: '30', max_uses: '50' })).toMatchObject({
      minSubtotalCents: 3000,
      maxUses: 50,
      startsAt: null,
      endsAt: null,
    });
  });
});
