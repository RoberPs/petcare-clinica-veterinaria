import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { purgeExpired } from '@/db/retention';
import { cardOrder, guestCart, makeCart, orderRow, seedShop } from './helpers/checkout';
import { createCustomer, q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Conservación de la tienda (D16): carritos de invitado, avisos de la pasarela, correos de pedido y
// anonimización de pedidos de más de 6 años.

describe('retention:purge · tienda', () => {
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

  it('borra los carritos de invitado sin cambios en cart_retention_days; no los recientes ni los de cliente', async () => {
    const old = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    const recent = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    const c = await createCustomer();
    const customerCart = await makeCart({ customerId: c.id, items: [{ slug: 'pienso-perro-adulto', quantity: 1 }] });
    await q(`UPDATE carts SET updated_at = now() - interval '31 days' WHERE id IN ($1, $2)`, [old.cartId, customerCart]);
    await q(`UPDATE carts SET updated_at = now() - interval '29 days' WHERE id = $1`, [recent.cartId]);

    expect((await purgeExpired(getDb())).guestCarts).toBe(1);
    const ids = (await q<{ id: string }>('SELECT id FROM carts')).map((r) => r.id).sort();
    expect(ids).toEqual([recent.cartId, customerCart].sort());
    expect(await q('SELECT count(*)::int AS n FROM cart_items WHERE cart_id = $1', [old.cartId])).toEqual([{ n: 0 }]);
  });

  it('borra los avisos de la pasarela de más de 90 días', async () => {
    await q(`INSERT INTO payment_events (provider_event_id, provider, type, received_at) VALUES
      ('evt_viejo', 'fake', 'checkout.session.completed', now() - interval '91 days'),
      ('evt_nuevo', 'fake', 'checkout.session.completed', now() - interval '89 days')`);
    expect((await purgeExpired(getDb())).paymentEvents).toBe(1);
    expect(await q('SELECT provider_event_id FROM payment_events')).toEqual([{ provider_event_id: 'evt_nuevo' }]);
  });

  it('borra los correos de pedido enviados o fallidos a las 24 h, nunca los pendientes', async () => {
    const { orderId } = await cardOrder();
    await q(
      `INSERT INTO email_outbox (kind, order_id, recipient_hash, payload, status, created_at)
       SELECT v.kind::outbox_kind, $1, 'hash', '{}'::jsonb, v.status::outbox_status, now() - interval '25 hours'
       FROM (VALUES ('order_confirmed', 'sent'), ('order_cancelled', 'failed'), ('order_received', 'pending')) v(kind, status)`,
      [orderId],
    );
    await purgeExpired(getDb());
    expect(await q('SELECT kind FROM email_outbox WHERE order_id = $1', [orderId])).toEqual([{ kind: 'order_received' }]);
  });

  it('anonimiza los pedidos de más de 6 años y conserva importes y líneas', async () => {
    const old = await cardOrder();
    const recent = await cardOrder(undefined, { email: 'otro@example.test' });
    await q(`UPDATE orders SET created_at = now() - interval '6 years 1 day' WHERE id = $1`, [old.orderId]);
    const before = await orderRow(old.orderId);

    expect((await purgeExpired(getDb())).anonymizedOrders).toBe(1);
    const after = await orderRow(old.orderId);
    expect(after).toMatchObject({
      contact_email: null,
      contact_email_normalized: null,
      first_name: null,
      last_name: null,
      address_line: null,
      postal_code: null,
      city: null,
      number: before.number,
      total_cents: before.total_cents,
    });
    expect(after.anonymized_at).not.toBeNull();
    expect(await q('SELECT count(*)::int AS n FROM order_items WHERE order_id = $1', [old.orderId])).toEqual([{ n: 1 }]);
    expect((await orderRow(recent.orderId)).contact_email).toBe('otro@example.test');
    // Una segunda pasada no vuelve a tocarlo.
    expect((await purgeExpired(getDb())).anonymizedOrders).toBe(0);
  });
});
