import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { processDeleteAccount } from '@/lib/account/delete-account';
import { handleExportRequest } from '@/lib/account/export';
import { confirmOrder } from '@/lib/checkout/confirm';
import { cancelOrder } from '@/lib/orders/cancel';
import { canTransition } from '@/domain/order-status';
import { getCustomerOrder, latestCustomerOrders, listCustomerOrders } from '@/db/queries/orders';
import { checkoutForm, customerCtx, guestCart, guestCtx, makeCart, orderRow, outboxKinds, productBySlug, seedShop } from './helpers/checkout';
import { createCustomer, createSessionFor, formData, q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// "Mis pedidos" (US5): lista y detalle filtrados por customer_id (SC-006), cancelación de
// pendientes, exportación v2 y borrado de cuenta con pedidos (D19).

const SLUG = 'pienso-perro-adulto';

async function customerOrder(customer: { id: string; email: string }, quantity = 1, at = new Date()): Promise<string> {
  await makeCart({ customerId: customer.id, items: [{ slug: SLUG, quantity }] });
  const result = await confirmOrder(checkoutForm({ email: undefined }), customerCtx(customer, at));
  if (result.status !== 'ok') throw new Error(`confirmOrder: ${result.status}`);
  // Un solo pedido con tarjeta pendiente por carrito: se vacía el carrito para el siguiente.
  await q(`DELETE FROM carts WHERE customer_id = $1`, [customer.id]);
  return result.orderId;
}

async function setStatus(orderId: string, status: string) {
  await q(`UPDATE orders SET status = $2, reservation_status = 'committed', paid_at = now() WHERE id = $1`, [orderId, status]);
}

describe('mis pedidos', () => {
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

  it('lista paginada de 10, del más reciente al más antiguo, y los 3 últimos para el resumen', async () => {
    const c = await createCustomer();
    const base = Date.now() - 12 * 60_000;
    const ids: string[] = [];
    // Pagados: los pendientes tienen límite por cliente (max_pending_per_customer).
    for (let i = 0; i < 12; i++) {
      ids.push(await customerOrder(c, 1, new Date(base + i * 60_000)));
      await setStatus(ids[i]!, 'paid');
    }
    const first = await listCustomerOrders(c.id, 1);
    expect(first.total).toBe(12);
    expect(first.items).toHaveLength(10);
    expect(first.items[0]!.number).toBe('PC-000012');
    expect((await listCustomerOrders(c.id, 2)).items.map((o) => o.number)).toEqual(['PC-000002', 'PC-000001']);
    expect((await latestCustomerOrders(c.id, 3)).map((o) => o.number)).toEqual(['PC-000012', 'PC-000011', 'PC-000010']);
  });

  it('IDOR: el número de un pedido ajeno da null, y los pedidos de invitado con el mismo correo no aparecen', async () => {
    const a = await createCustomer();
    const b = await createCustomer();
    const orderId = await customerOrder(a);
    const { number } = await orderRow(orderId);
    expect(await getCustomerOrder(a.id, number)).not.toBeNull();
    expect(await getCustomerOrder(b.id, number)).toBeNull();
    expect(await getCustomerOrder(a.id, 'PC-999999')).toBeNull();

    const { token } = await guestCart([{ slug: SLUG, quantity: 1 }]);
    const guest = await confirmOrder(checkoutForm({ email: b.email }), guestCtx(token));
    expect(guest.status).toBe('ok');
    if (guest.status === 'ok') expect((await orderRow(guest.orderId)).customer_id).toBeNull();
    expect((await listCustomerOrders(b.id, 1)).total).toBe(0);
  });

  it('cancelar un pendiente propio libera el stock y avisa; un pagado no se puede cancelar por el cliente', async () => {
    const c = await createCustomer();
    const before = (await productBySlug(SLUG)).stock;
    const orderId = await customerOrder(c, 2);
    expect((await productBySlug(SLUG)).stock).toBe(before - 2);
    await cancelOrder(orderId, 'customer', { reason: 'customer', now: new Date() });
    expect(await orderRow(orderId)).toMatchObject({ status: 'cancelled', cancel_reason: 'customer', reservation_status: 'released' });
    expect((await productBySlug(SLUG)).stock).toBe(before);
    expect(await outboxKinds(orderId)).toContain('order_cancelled');

    const paid = await customerOrder(c);
    await setStatus(paid, 'paid');
    const row = await orderRow(paid);
    expect(canTransition({ status: row.status, paymentMethod: row.payment_method, shippingKind: row.shipping_kind, cancelReason: null }, 'cancelled', 'customer')).toBe(false);
  });

  it('exportación v2: solo los pedidos del cliente', async () => {
    const c = await createCustomer();
    const other = await createCustomer();
    await customerOrder(c, 2);
    await customerOrder(other);
    const token = await createSessionFor(c.id);
    const host = 'petcare.example';
    const res = await handleExportRequest(
      new Request(`https://${host}/api/account/export`, {
        method: 'POST',
        headers: { host, cookie: `pc_session=${token}`, origin: `https://${host}`, 'sec-fetch-site': 'same-origin' },
      }),
      new Date(),
    );
    const data = (await res.json()) as { format_version: number; orders: { number: string; items: { quantity: number }[] }[] };
    expect(data.format_version).toBe(2);
    expect(data.orders.map((o) => o.number)).toEqual(['PC-000001']);
    expect(data.orders[0]!.items[0]!.quantity).toBe(2);
  });

  it('borrar la cuenta: pendientes cancelados (account_deleted), el resto desvinculado y fuera de cualquier vista', async () => {
    const c = await createCustomer();
    const pending = await customerOrder(c, 1);
    const paid = await customerOrder(c, 1);
    await setStatus(paid, 'paid');
    const stockBefore = (await productBySlug(SLUG)).stock;
    const { number } = await orderRow(paid);

    const out = await processDeleteAccount(formData({ current_password: c.password }), c, { ip: '203.0.113.9', now: new Date() });
    expect(out.result.status).toBe('ok');
    expect(await orderRow(pending)).toMatchObject({ status: 'cancelled', cancel_reason: 'account_deleted', customer_id: null, access_version: 2 });
    expect(await orderRow(paid)).toMatchObject({ status: 'paid', customer_id: null, access_version: 2 });
    expect((await productBySlug(SLUG)).stock).toBe(stockBefore + 1);
    // Sin correo de cancelación: el cliente ya recibe el de la baja.
    expect(await outboxKinds(pending)).not.toContain('order_cancelled');
    expect(await getCustomerOrder(c.id, number)).toBeNull();
  });
});
