import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { confirmOrder } from '@/lib/checkout/confirm';
import {
  checkoutForm,
  disableShop,
  guestCart,
  guestCtx,
  orderRow,
  PENINSULA_PREFIXES,
  productBySlug,
  seedCheckoutConfig,
  seedShop,
} from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Envío y recogida (US4): zona por prefijo también en el servidor, recogida sin dirección,
// métodos desactivados enviados a mano y copia del envío en el pedido.

const SLUG = 'pienso-perro-adulto';
const PICKUP = { shipping_method: 'recogida', address_line: 'Calle Falsa 1', postal_code: '28001', city: 'Madrid' };

async function confirmWith(overrides: Record<string, string>) {
  const { token } = await guestCart([{ slug: SLUG, quantity: 1 }]);
  return confirmOrder(checkoutForm(overrides), guestCtx(token));
}

async function orderCount(): Promise<number> {
  return (await q<{ n: number }>('SELECT count(*)::int AS n FROM orders'))[0]!.n;
}

describe('confirmOrder · envío y recogida', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedShop();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('fuera de zona: rechazado en el servidor aunque se envíe a mano', async () => {
    await seedCheckoutConfig({ postalPrefixes: PENINSULA_PREFIXES });
    const result = await confirmWith({ postal_code: '35001', city: 'Las Palmas' });
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.fieldErrors.postal_code).toBe('No enviamos a este código postal. Puedes recogerlo en la clínica.');
    expect(result.values.postal_code).toBe('35001');
    expect(await orderCount()).toBe(0);

    // El mismo código postal es válido con recogida.
    expect((await confirmWith({ ...PICKUP, postal_code: '35001' })).status).toBe('ok');
  });

  it('recogida: ignora y no guarda los campos de dirección', async () => {
    const result = await confirmWith(PICKUP);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(await orderRow(result.orderId)).toMatchObject({
      shipping_kind: 'clinic_pickup',
      shipping_name: 'Recogida en la clínica',
      address_line: null,
      postal_code: null,
      city: null,
    });
  });

  it('recogida con dirección no válida: no se valida porque se descarta', async () => {
    expect((await confirmWith({ ...PICKUP, postal_code: '99', address_line: '', city: '' })).status).toBe('ok');
  });

  it('método de envío desactivado enviado a mano → invalid', async () => {
    await q(`UPDATE shipping_methods SET enabled = false WHERE code = 'domicilio'`);
    const result = await confirmWith({});
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(Object.keys(result.fieldErrors)).toContain('shipping_method');
    expect(await orderCount()).toBe(0);
  });

  it('método de envío inexistente → invalid', async () => {
    expect((await confirmWith({ shipping_method: 'dron' })).status).toBe('invalid');
  });

  it('tarjeta desactivada enviada a mano → invalid', async () => {
    await q('UPDATE shop_settings SET card_enabled = false');
    const result = await confirmWith({});
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(Object.keys(result.fieldErrors)).toContain('payment_method');
    expect(await orderCount()).toBe(0);
  });

  it('pago en clínica desactivado enviado a mano → invalid', async () => {
    await q('UPDATE shop_settings SET in_clinic_enabled = false');
    const result = await confirmWith({ ...PICKUP, payment_method: 'in_clinic' });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(Object.keys(result.fieldErrors)).toContain('payment_method');
    expect(await orderCount()).toBe(0);
  });

  it('pago en clínica con envío a domicilio → invalid', async () => {
    const result = await confirmWith({ payment_method: 'in_clinic' });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.fieldErrors.payment_method).toBe('El pago en clínica solo está disponible con recogida en la clínica');
  });

  it('compra desactivada (sections.carrito.href nulo) → rechazado sin crear pedido', async () => {
    await disableShop();
    const result = await confirmWith({});
    expect(result.status).not.toBe('ok');
    expect(await orderCount()).toBe(0);
    expect(await q('SELECT count(*)::int AS n FROM payments')).toEqual([{ n: 0 }]);
  });

  it('copia nombre, coste e IVA del envío en el pedido (un cambio posterior no lo altera)', async () => {
    await q(`UPDATE shipping_methods SET name = 'Mensajería', cost_cents = 495, vat_rate = 10 WHERE code = 'domicilio'`);
    const p = await productBySlug(SLUG);
    const result = await confirmWith({});
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    await q(`UPDATE shipping_methods SET name = 'Otro', cost_cents = 900, vat_rate = 21 WHERE code = 'domicilio'`);
    expect(await orderRow(result.orderId)).toMatchObject({
      shipping_method_code: 'domicilio',
      shipping_kind: 'home_delivery',
      shipping_name: 'Mensajería',
      shipping_cost_cents: 495,
      shipping_vat_rate: 10,
      total_cents: p.price_cents + 495,
      address_line: 'Calle de las Pruebas 1',
      postal_code: '28001',
      city: 'Madrid',
    });
  });
});
