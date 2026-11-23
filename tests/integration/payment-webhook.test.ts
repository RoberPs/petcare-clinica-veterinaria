import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { emitFakeEvent, fakeCompletedEvent, fakeProvider, fakeSecret } from '@/lib/payments/fake';
import { setPaymentProviderForTests } from '@/lib/payments/provider';
import { signatureHeader } from '@/lib/payments/signature';
import { handleWebhookRequest, reconcilePayment } from '@/lib/payments/webhook';
import { cardOrder, cartLines, orderRow, outboxKinds, productBySlug, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Aviso firmado de la pasarela (D7, SC-003): idempotencia, firma, errores y caducidad.

describe('aviso de la pasarela', () => {
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

  it('evento válido: Pagado, reserva confirmada, carrito vacío y un correo de cada tipo', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const o = await cardOrder([{ slug: p.slug, quantity: 2 }]);
    expect(await emitFakeEvent(fakeCompletedEvent(o.sessionId, o.amountCents, o.orderId))).toEqual([200]);
    expect(await orderRow(o.orderId)).toMatchObject({ status: 'paid', reservation_status: 'committed' });
    expect((await orderRow(o.orderId)).paid_at).not.toBeNull();
    expect(await cartLines(o.cartId)).toEqual([]);
    expect((await outboxKinds(o.orderId)).sort()).toEqual(['clinic_order', 'order_confirmed']);
    expect((await productBySlug(p.slug)).stock).toBe(p.stock - 2);
    expect(await q('SELECT status FROM payments')).toEqual([{ status: 'succeeded' }]);
  });

  it('evento duplicado y simultáneo con la conciliación: un solo cambio y un solo correo', async () => {
    const o = await cardOrder();
    // Conciliación con una pasarela que ya dice "pagado" (como Stripe al volver el navegador).
    setPaymentProviderForTests({
      ...fakeProvider,
      retrieveCheckout: async () => ({ status: 'complete', paid: true, paymentId: 'fake_pi_x', amountCents: o.amountCents, orderId: o.orderId }),
    });
    const event = fakeCompletedEvent(o.sessionId, o.amountCents, o.orderId);
    const [statuses] = await Promise.all([
      emitFakeEvent(event, { duplicate: true }),
      reconcilePayment({ providerSessionId: o.sessionId }, new Date()),
      reconcilePayment({ providerSessionId: o.sessionId }, new Date()),
    ]);
    expect(statuses).toEqual([200, 200]);
    expect(await q(`SELECT count(*)::int AS n FROM order_status_history WHERE to_status = 'paid'`)).toEqual([{ n: 1 }]);
    expect((await outboxKinds(o.orderId)).filter((k) => k === 'order_confirmed')).toHaveLength(1);
    expect(await q('SELECT count(*)::int AS n FROM payment_events')).toEqual([{ n: 1 }]);
  });

  it('firma no válida: 400 y nada cambia', async () => {
    const o = await cardOrder();
    const raw = JSON.stringify(fakeCompletedEvent(o.sessionId, o.amountCents));
    const bad = new Headers({ 'stripe-signature': signatureHeader(raw, 'otro-secreto', new Date()) });
    expect(await handleWebhookRequest(raw, bad, new Date())).toEqual({ status: 400 });
    const tampered = new Headers({ 'stripe-signature': signatureHeader(raw, fakeSecret(), new Date()) });
    expect(await handleWebhookRequest(raw.replace('true', 'false'), tampered, new Date())).toEqual({ status: 400 });
    expect((await orderRow(o.orderId)).status).toBe('pending_payment');
    expect(await q('SELECT count(*)::int AS n FROM payment_events')).toEqual([{ n: 0 }]);
  });

  it('error al procesar: 500 sin registrar el evento (la pasarela lo reintenta)', async () => {
    const event = fakeCompletedEvent('fake_00000000-0000-4000-8000-000000000000', 100);
    expect(await emitFakeEvent(event)).toEqual([500]);
    expect(await q('SELECT count(*)::int AS n FROM payment_events')).toEqual([{ n: 0 }]);
  });

  it('importe distinto: error registrado, el pedido no se paga y se reembolsa', async () => {
    const o = await cardOrder();
    expect(await emitFakeEvent(fakeCompletedEvent(o.sessionId, o.amountCents + 1))).toEqual([200]);
    const order = await orderRow(o.orderId);
    expect(order.status).toBe('pending_payment');
    expect(order.refund_status).toBe('refunded');
    expect(await q('SELECT status FROM payments')).toEqual([{ status: 'refunded' }]);
  });

  it('checkout.expired cancela si sigue pendiente y libera el stock', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const o = await cardOrder([{ slug: p.slug, quantity: 1 }]);
    expect(await emitFakeEvent({ id: 'evt_exp_1', type: 'checkout.expired', sessionId: o.sessionId, orderId: o.orderId })).toEqual([200]);
    expect(await orderRow(o.orderId)).toMatchObject({ status: 'cancelled', cancel_reason: 'expired', reservation_status: 'released' });
    expect((await productBySlug(p.slug)).stock).toBe(p.stock);
    expect(await outboxKinds(o.orderId)).toEqual(['order_cancelled']);
  });

  it('eventos ignorados se registran como tales', async () => {
    expect(await emitFakeEvent({ id: 'evt_ign_1', type: 'ignored', rawType: 'customer.created' })).toEqual([200]);
    expect(await q('SELECT result FROM payment_events')).toEqual([{ result: 'ignored' }]);
  });
});
