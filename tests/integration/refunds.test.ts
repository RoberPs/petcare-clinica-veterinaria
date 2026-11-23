import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cancelOrder } from '@/lib/orders/cancel';
import { retryRefunds } from '@/lib/orders/maintain';
import { MAX_REFUND_ATTEMPTS, refundOrder } from '@/lib/orders/refund';
import { emitFakeEvent, fakeCompletedEvent, fakeProvider } from '@/lib/payments/fake';
import { PaymentProviderError, setPaymentProviderForTests } from '@/lib/payments/provider';
import { cardOrder, orderRow, outboxKinds, productBySlug, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Reembolsos (D9) y correo de cancelación con la frase del reembolso (contracts/emails.md).

async function paidOrder() {
  const o = await cardOrder();
  await emitFakeEvent(fakeCompletedEvent(o.sessionId, o.amountCents, o.orderId));
  return o;
}

const failingRefunds = () =>
  setPaymentProviderForTests({
    ...fakeProvider,
    refund: async () => {
      throw new PaymentProviderError('http_503', true);
    },
  });

async function cancelledText(orderId: string): Promise<string> {
  const [row] = await q(`SELECT payload FROM email_outbox WHERE order_id = $1 AND kind = 'order_cancelled' ORDER BY created_at DESC LIMIT 1`, [orderId]);
  return row!.payload.text as string;
}

describe('reembolsos', () => {
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

  it('la clínica cancela un pedido pagado: stock devuelto, reembolso y "Te hemos devuelto…"', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const o = await paidOrder();
    const result = await cancelOrder(o.orderId, 'clinic', { now: new Date() });
    expect(result.refund).toBe('refunded');
    expect(await orderRow(o.orderId)).toMatchObject({ status: 'cancelled', cancel_reason: 'clinic', refund_status: 'refunded', reservation_status: 'released' });
    expect((await productBySlug(p.slug)).stock).toBe(p.stock);
    expect(await cancelledText(o.orderId)).toContain('Te hemos devuelto');
    expect(await q('SELECT status FROM payments')).toEqual([{ status: 'refunded' }]);
  });

  it('refundOrder es idempotente', async () => {
    const o = await paidOrder();
    await cancelOrder(o.orderId, 'clinic', { now: new Date() });
    expect(await refundOrder(o.orderId, { now: new Date() })).toBe('refunded');
    expect((await outboxKinds(o.orderId)).filter((k) => k === 'order_cancelled')).toHaveLength(1);
  });

  it('fallo de la pasarela: pending con "Estamos tramitando…" y reintentos hasta failed a los 8', async () => {
    const o = await paidOrder();
    failingRefunds();
    const now = new Date();
    expect((await cancelOrder(o.orderId, 'clinic', { now })).refund).toBe('pending');
    expect(await cancelledText(o.orderId)).toContain('Estamos tramitando la devolución');
    let row = await orderRow(o.orderId);
    expect(row).toMatchObject({ refund_status: 'pending', refund_attempts: 1 });
    const first = row.refund_next_attempt_at as Date;
    // Antes de la hora del siguiente intento no se reintenta.
    expect(await retryRefunds(now)).toBe(0);
    let at = first;
    for (let i = 2; i <= MAX_REFUND_ATTEMPTS; i++) {
      at = new Date((await orderRow(o.orderId)).refund_next_attempt_at.getTime() + 1);
      expect(await retryRefunds(at)).toBe(1);
    }
    row = await orderRow(o.orderId);
    expect(row).toMatchObject({ refund_status: 'failed', refund_attempts: MAX_REFUND_ATTEMPTS, refund_next_attempt_at: null });
    // Espera creciente entre intentos.
    expect(first.getTime() - now.getTime()).toBeLessThan(at.getTime() - first.getTime());
    // No hay más correos de cancelación.
    expect((await outboxKinds(o.orderId)).filter((k) => k === 'order_cancelled')).toHaveLength(1);
  });

  it('refund.succeeded confirma un reembolso pendiente sin un segundo correo', async () => {
    const o = await paidOrder();
    failingRefunds();
    await cancelOrder(o.orderId, 'clinic', { now: new Date() });
    setPaymentProviderForTests(null);
    const [pay] = await q<{ provider_payment_id: string }>('SELECT provider_payment_id FROM payments WHERE order_id = $1', [o.orderId]);
    expect(await emitFakeEvent({ id: 'evt_ref_1', type: 'refund.succeeded', paymentId: pay!.provider_payment_id, refundId: 'fake_re_1' })).toEqual([200]);
    expect(await orderRow(o.orderId)).toMatchObject({ refund_status: 'refunded' });
    expect((await outboxKinds(o.orderId)).filter((k) => k === 'order_cancelled')).toHaveLength(1);
  });

  it('un pedido sin pagar no necesita reembolso', async () => {
    const o = await cardOrder();
    expect(await refundOrder(o.orderId, { now: new Date() })).toBe('not_needed');
  });
});
