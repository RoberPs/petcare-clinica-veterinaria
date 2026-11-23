import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expireOrders, reconcileOpenSessions, runOrdersMaintenance } from '@/lib/orders/maintain';
import { emitFakeEvent, fakeCompletedEvent, fakeProvider } from '@/lib/payments/fake';
import { setPaymentProviderForTests } from '@/lib/payments/provider';
import { cardOrder, orderRow, outboxKinds, productBySlug, seedShop, setStock } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Tarea de mantenimiento (D8, D16, SC-004): caducidad, conciliación y pago tardío.

const MIN = 60_000;

describe('orders:maintain', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedShop();
  });
  afterEach(() => setPaymentProviderForTests(null));
  afterAll(async () => {
    await teardownTestDb();
  });

  it('caduca los pedidos con tarjeta tras reservation_expires_at + 2 min', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const start = new Date();
    const o = await cardOrder([{ slug: p.slug, quantity: 1 }], { now: start });
    await q(`UPDATE discount_codes SET uses_count = 0`);
    // Dentro de plazo (30 min de reserva + 2 de margen): no se toca.
    expect(await expireOrders(new Date(start.getTime() + 31 * MIN))).toBe(0);
    expect((await orderRow(o.orderId)).status).toBe('pending_payment');
    // Pasado el plazo: cancelado, stock liberado y correo.
    expect(await expireOrders(new Date(start.getTime() + 33 * MIN))).toBe(1);
    expect(await orderRow(o.orderId)).toMatchObject({ status: 'cancelled', cancel_reason: 'expired', cancelled_by: 'system', reservation_status: 'released' });
    expect((await productBySlug(p.slug)).stock).toBe(p.stock);
    expect(await outboxKinds(o.orderId)).toEqual(['order_cancelled']);
  });

  it('libera también el uso del código de descuento', async () => {
    const { confirmOrder } = await import('@/lib/checkout/confirm');
    const { guestCart, checkoutForm, guestCtx } = await import('./helpers/checkout');
    const start = new Date();
    const { token } = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }], { discountCode: 'PETCARE5' });
    const r = await confirmOrder(checkoutForm(), guestCtx(token, start));
    expect(r.status).toBe('ok');
    expect(await q(`SELECT uses_count FROM discount_codes WHERE code = 'PETCARE5'`)).toEqual([{ uses_count: 1 }]);
    await expireOrders(new Date(start.getTime() + 40 * MIN));
    expect(await q(`SELECT uses_count FROM discount_codes WHERE code = 'PETCARE5'`)).toEqual([{ uses_count: 0 }]);
  });

  it('concilia las sesiones abiertas de más de 5 minutos', async () => {
    const start = new Date();
    const o = await cardOrder(undefined, { now: start });
    setPaymentProviderForTests({
      ...fakeProvider,
      retrieveCheckout: async () => ({ status: 'complete', paid: true, paymentId: 'fake_pi_r', amountCents: o.amountCents, orderId: o.orderId }),
    });
    // Recién creada: todavía no.
    expect(await reconcileOpenSessions(new Date(start.getTime() + MIN))).toBe(0);
    await q(`UPDATE payments SET created_at = now() - interval '6 minutes'`);
    expect(await reconcileOpenSessions(new Date())).toBe(1);
    expect((await orderRow(o.orderId)).status).toBe('paid');
  });

  it('pago tardío con stock: el pedido caducado pasa a Pagado', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const start = new Date();
    const o = await cardOrder([{ slug: p.slug, quantity: 1 }], { now: start });
    await expireOrders(new Date(start.getTime() + 40 * MIN));
    expect(await emitFakeEvent(fakeCompletedEvent(o.sessionId, o.amountCents, o.orderId))).toEqual([200]);
    expect(await orderRow(o.orderId)).toMatchObject({ status: 'paid', reservation_status: 'committed', cancel_reason: null });
    expect((await productBySlug(p.slug)).stock).toBe(p.stock - 1);
    expect(await outboxKinds(o.orderId)).toEqual(expect.arrayContaining(['order_cancelled', 'order_confirmed', 'clinic_order']));
  });

  it('pago tardío sin stock: sigue cancelado (stock_unavailable), se reembolsa y se avisa', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const start = new Date();
    const o = await cardOrder([{ slug: p.slug, quantity: 1 }], { now: start });
    await expireOrders(new Date(start.getTime() + 40 * MIN));
    await setStock(p.slug, 0);
    expect(await emitFakeEvent(fakeCompletedEvent(o.sessionId, o.amountCents, o.orderId))).toEqual([200]);
    expect(await orderRow(o.orderId)).toMatchObject({ status: 'cancelled', cancel_reason: 'stock_unavailable', refund_status: 'refunded' });
    expect((await productBySlug(p.slug)).stock).toBe(0);
    expect((await outboxKinds(o.orderId)).filter((k) => k === 'order_cancelled')).toHaveLength(2);
    const [last] = await q(`SELECT payload FROM email_outbox WHERE order_id = $1 AND kind = 'order_cancelled' ORDER BY created_at DESC LIMIT 1`, [o.orderId]);
    expect(last!.payload.text).toContain('Te hemos devuelto');
  });

  it('caduca los pedidos de pago en clínica al pasar pickup_deadline', async () => {
    const { confirmOrder } = await import('@/lib/checkout/confirm');
    const { guestCart, checkoutForm, guestCtx } = await import('./helpers/checkout');
    const p = await productBySlug('pienso-perro-adulto');
    const start = new Date();
    const { token } = await guestCart([{ slug: p.slug, quantity: 2 }]);
    const r = await confirmOrder(checkoutForm({ shipping_method: 'recogida', payment_method: 'in_clinic' }), guestCtx(token, start));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const order = await orderRow(r.orderId);
    expect(order.reservation_expires_at).toBeNull();
    const deadline = new Date(order.pickup_deadline);
    expect((await productBySlug(p.slug)).stock).toBe(p.stock - 2);
    // La reserva de tarjeta (30 min) no aplica: sigue pendiente hasta el plazo de recogida.
    expect(await expireOrders(new Date(start.getTime() + 60 * MIN))).toBe(0);
    expect(await expireOrders(new Date(deadline.getTime() - 1000))).toBe(0);
    expect(await expireOrders(new Date(deadline.getTime() + 1000))).toBe(1);
    expect(await orderRow(r.orderId)).toMatchObject({ status: 'cancelled', cancel_reason: 'expired', reservation_status: 'released' });
    expect((await productBySlug(p.slug)).stock).toBe(p.stock);
    expect(await outboxKinds(r.orderId)).toContain('order_cancelled');
  });

  it('runOrdersMaintenance devuelve los contadores', async () => {
    expect(await runOrdersMaintenance(new Date())).toEqual({ reconciled: 0, expired: 0, refundsRetried: 0 });
  });
});
