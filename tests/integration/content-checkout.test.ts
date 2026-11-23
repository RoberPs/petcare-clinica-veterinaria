import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ContentValidationError } from '@/content/load';
import { getCheckoutConfig, isShopEnabled } from '@/db/queries/checkout-config';
import { seedCheckoutConfig, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Carga del bloque checkout: (contracts/content-file.md).

describe('carga del bloque checkout:', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('carga los ajustes, los métodos de envío y los códigos', async () => {
    await seedShop();
    expect(await isShopEnabled()).toBe(true);
    const config = await getCheckoutConfig();
    expect(config!.settings).toMatchObject({ orderPrefix: 'PC-', reservationMinutes: 30, pickupDays: 7, maxQtyPerLine: 10 });
    expect(config!.shippingMethods.map((m) => m.code)).toEqual(['domicilio', 'recogida']);
    expect(config!.paymentMethods).toEqual(['card', 'in_clinic']);
    const codes = await q('SELECT code, kind, value, min_subtotal_cents, max_uses, uses_count, enabled FROM discount_codes ORDER BY code');
    expect(codes).toEqual([
      { code: 'BIENVENIDA10', kind: 'percent', value: 10, min_subtotal_cents: null, max_uses: null, uses_count: 0, enabled: true },
      { code: 'PETCARE5', kind: 'fixed', value: 500, min_subtotal_cents: 3000, max_uses: 100, uses_count: 0, enabled: true },
    ]);
    // ends_at: 2027-12-31 es válido hasta el final de ese día en Madrid.
    const [b] = await q(`SELECT ends_at FROM discount_codes WHERE code = 'BIENVENIDA10'`);
    expect((b!.ends_at as Date).toISOString()).toBe('2027-12-31T23:00:00.000Z');
  });

  it('cargar dos veces no cambia uses_count', async () => {
    await seedShop();
    await q(`UPDATE discount_codes SET uses_count = 7 WHERE code = 'PETCARE5'`);
    await seedShop();
    const [row] = await q(`SELECT uses_count FROM discount_codes WHERE code = 'PETCARE5'`);
    expect(row!.uses_count).toBe(7);
  });

  it('un método o un código quitados del YAML quedan desactivados, no borrados', async () => {
    await seedShop();
    await seedCheckoutConfig({
      mutate: (checkout) => {
        checkout.shipping_methods = checkout.shipping_methods.filter((m: any) => m.code !== 'domicilio');
        checkout.discount_codes = [];
      },
    });
    expect(await q('SELECT code, enabled FROM shipping_methods ORDER BY code')).toEqual([
      { code: 'domicilio', enabled: false },
      { code: 'recogida', enabled: true },
    ]);
    expect((await q('SELECT enabled FROM discount_codes')).every((r) => r.enabled === false)).toBe(true);
    const config = await getCheckoutConfig();
    expect(config!.shippingMethods.map((m) => m.code)).toEqual(['recogida']);
  });

  it('guarda los prefijos postales de la variante peninsular', async () => {
    await seedCheckoutConfig({ postalPrefixes: ['28', '08'] });
    const [row] = await q(`SELECT postal_prefixes FROM shipping_methods WHERE code = 'domicilio'`);
    expect(row!.postal_prefixes).toEqual(['28', '08']);
  });

  it('una carga con un error no deja nada a medias', async () => {
    await seedShop();
    await expect(
      seedCheckoutConfig({
        mutate: (checkout, content) => {
          checkout.order_prefix = 'NUEVO-';
          content.clinic.name = '';
        },
      }),
    ).rejects.toBeInstanceOf(ContentValidationError);
    const [row] = await q('SELECT order_prefix FROM shop_settings');
    expect(row!.order_prefix).toBe('PC-');
  });

  it('una carga que falla en la base revierte también el checkout', async () => {
    await seedShop();
    await q(`UPDATE discount_codes SET uses_count = 100 WHERE code = 'PETCARE5'`);
    // max_uses por debajo de los usos ya hechos viola el CHECK: la transacción entera se revierte.
    await expect(
      seedCheckoutConfig({
        mutate: (checkout) => {
          checkout.order_prefix = 'NUEVO-';
          checkout.discount_codes.find((d: any) => d.code === 'PETCARE5').max_uses = 5;
        },
      }),
    ).rejects.toThrow();
    const [row] = await q('SELECT order_prefix FROM shop_settings');
    expect(row!.order_prefix).toBe('PC-');
  });

  it('sin carrito activo la compra está desactivada', async () => {
    await seedShop((content) => {
      content.sections.find((s: any) => s.key === 'carrito').href = null;
    });
    expect(await isShopEnabled()).toBe(false);
  });
});
