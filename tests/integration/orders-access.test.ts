import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { confirmOrder } from '@/lib/checkout/confirm';
import { getDb } from '@/db/client';
import { listCustomerOrders } from '@/db/queries/orders';
import { orderPath, signGuestToken } from '@/lib/orders/access';
import { findGuestOrder } from '@/lib/orders/locate';
import { transitionOrder } from '@/lib/orders/transition';
import { cardOrder, checkoutForm, guestCart, guestCtx, orderRow, seedShop } from './helpers/checkout';
import { createCustomer, q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Enlace privado de invitado (US6, D18): firma, versión, caducidad por last_status_at y sin asociar
// el pedido a una cuenta con el mismo correo.

const DAY = 24 * 60 * 60 * 1000;

describe('acceso de invitado a su pedido', () => {
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

  it('token válido → el pedido; el correo lleva esa misma ruta', async () => {
    const { orderId } = await cardOrder();
    const token = signGuestToken({ orderId, version: 1 });
    const found = await findGuestOrder(token, new Date());
    expect(found.status).toBe('ok');
    if (found.status === 'ok') expect(found.order.id).toBe(orderId);
    const row = await orderRow(orderId);
    expect(orderPath({ id: orderId, number: row.number, customerId: null, accessVersion: 1 })).toBe(`/pedido/${token}`);
  });

  it('firma alterada, token de otro pedido o access_version distinta → no encontrado', async () => {
    const { orderId } = await cardOrder();
    const token = signGuestToken({ orderId, version: 1 });
    const [body, mac] = token.split('.') as [string, string];
    const flipped = `${body}.${mac.slice(0, -1)}${mac.endsWith('A') ? 'B' : 'A'}`;
    expect((await findGuestOrder(flipped, new Date())).status).toBe('not_found');
    expect((await findGuestOrder('nada', new Date())).status).toBe('not_found');
    expect((await findGuestOrder(signGuestToken({ orderId: crypto.randomUUID(), version: 1 }), new Date())).status).toBe('not_found');
    expect((await findGuestOrder(signGuestToken({ orderId, version: 2 }), new Date())).status).toBe('not_found');
    await q('UPDATE orders SET access_version = 2 WHERE id = $1', [orderId]);
    expect((await findGuestOrder(token, new Date())).status).toBe('not_found');
    expect((await findGuestOrder(signGuestToken({ orderId, version: 2 }), new Date())).status).toBe('ok');
  });

  it('caduca a los guest_link_days desde last_status_at y un cambio de estado amplía la validez', async () => {
    const created = new Date('2026-11-13T10:00:00Z');
    const { orderId } = await cardOrder(undefined, { now: created });
    await q('UPDATE orders SET last_status_at = $2 WHERE id = $1', [orderId, created]);
    const token = signGuestToken({ orderId, version: 1 });
    const [{ guest_link_days: days }] = (await q<{ guest_link_days: number }>('SELECT guest_link_days FROM shop_settings')) as [{ guest_link_days: number }];

    expect((await findGuestOrder(token, new Date(created.getTime() + days * DAY - 1000))).status).toBe('ok');
    expect((await findGuestOrder(token, new Date(created.getTime() + days * DAY + 1000))).status).toBe('expired');

    // Pago a los 10 días: el enlace vuelve a valer guest_link_days desde ese cambio.
    const paidAt = new Date(created.getTime() + 10 * DAY);
    await getDb().transaction((tx) => transitionOrder(tx, orderId, 'paid', 'gateway', { now: paidAt }));
    expect((await findGuestOrder(token, new Date(created.getTime() + days * DAY + 1000))).status).toBe('ok');
    expect((await findGuestOrder(token, new Date(paidAt.getTime() + days * DAY + 1000))).status).toBe('expired');
  });

  it('un invitado con el correo de una cuenta: customer_id nulo y fuera de esa cuenta', async () => {
    const c = await createCustomer();
    const { orderId } = await cardOrder(undefined, { email: c.email.toUpperCase() });
    expect((await orderRow(orderId)).customer_id).toBeNull();
    expect((await listCustomerOrders(c.id, 1)).total).toBe(0);
  });

  it('max_pending_per_email: el siguiente pedido pendiente con el mismo correo → limit_reached', async () => {
    const [{ max_pending_per_email: max }] = (await q<{ max_pending_per_email: number }>('SELECT max_pending_per_email FROM shop_settings')) as [
      { max_pending_per_email: number },
    ];
    for (let i = 0; i < max; i++) await cardOrder(undefined, { email: 'repetido@example.test' });
    const { token } = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    const result = await confirmOrder(checkoutForm({ email: 'Repetido@example.test' }), guestCtx(token));
    expect(result.status).toBe('limit_reached');
    expect(await q('SELECT count(*)::int AS n FROM orders')).toEqual([{ n: max }]);
  });
});
