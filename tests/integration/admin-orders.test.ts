import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cancelOrderAdmin, retryRefundAdmin, setOrderStatusAdmin } from '@/lib/admin/orders';
import { MAX_REFUND_ATTEMPTS } from '@/lib/orders/refund';
import { emitFakeEvent, fakeCompletedEvent, fakeProvider } from '@/lib/payments/fake';
import { PaymentProviderError, setPaymentProviderForTests } from '@/lib/payments/provider';
import { adminCtx, cardOrder, guestCart, orderInStatus, orderRow, outboxKinds, productBySlug, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Cambios de estado desde el panel (US3, G7 a G11): historial con autor, correo order_status,
// auditoría, control de concurrencia, cancelación con reembolso y reintento del reembolso.

let admin: { id: string };

async function paidOrder(items = [{ slug: 'pienso-perro-adulto', quantity: 2 }], discountCode?: string) {
  const o = discountCode
    ? await (async () => {
        const { confirmOrder } = await import('@/lib/checkout/confirm');
        const { checkoutForm, guestCtx } = await import('./helpers/checkout');
        const { token } = await guestCart(items, { discountCode });
        const r = await confirmOrder(checkoutForm(), guestCtx(token));
        if (r.status !== 'ok') throw new Error(r.status);
        const [p] = await q<{ provider_session_id: string; amount_cents: number }>('SELECT provider_session_id, amount_cents FROM payments WHERE order_id = $1', [r.orderId]);
        return { orderId: r.orderId, sessionId: p!.provider_session_id, amountCents: p!.amount_cents };
      })()
    : await cardOrder(items);
  await emitFakeEvent(fakeCompletedEvent(o.sessionId, o.amountCents, o.orderId));
  await q('DELETE FROM email_outbox WHERE order_id = $1', [o.orderId]);
  return o;
}

const history = (orderId: string) =>
  q<{ from_status: string; to_status: string; actor: string; admin_id: string | null; note: string | null }>(
    'SELECT from_status, to_status, actor, admin_id, note FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id',
    [orderId],
  );

describe('pedidos desde el panel', () => {
  beforeAll(setupTestDb);
  beforeEach(async () => {
    await truncateAll();
    await seedShop();
    admin = await adminCtx();
  });
  afterEach(() => setPaymentProviderForTests(null));
  afterAll(teardownTestDb);

  it('cada transición permitida deja historial con autor, encola order_status y registra la acción', async () => {
    for (const [delivery, steps] of [
      ['home', ['preparing', 'shipped', 'delivered']],
      ['pickup', ['preparing', 'ready_for_pickup', 'delivered']],
    ] as const) {
      const { orderId } = await orderInStatus('paid', { delivery });
      await q('DELETE FROM email_outbox WHERE order_id = $1', [orderId]);
      let from = 'paid';
      for (const [i, to] of steps.entries()) {
        const r = await setOrderStatusAdmin(admin, { id: orderId, from: from as never, to }, new Date(Date.now() + (i + 10) * 1000));
        expect(r, `${delivery} ${to}`).toEqual({ status: 'ok' });
        from = to;
      }
      const h = (await history(orderId)).slice(-3);
      expect(h.map((x) => [x.to_status, x.actor, x.admin_id])).toEqual(steps.map((s) => [s, 'clinic', admin.id]));
      expect(await outboxKinds(orderId)).toEqual(['order_status', 'order_status', 'order_status']);
      const audit = await q<{ action: string; changes: Record<string, string> }>(
        "SELECT action, changes FROM admin_audit_log WHERE entity_type = 'order' AND entity_id = $1 ORDER BY at",
        [orderId],
      );
      expect(audit.map((a) => a.changes.to)).toEqual([...steps]);
      expect(audit.every((a) => a.action === 'order.status')).toBe(true);
      expect(JSON.stringify(audit)).not.toContain('comprador@example.test');
    }
  });

  it('una transición no permitida no cambia nada', async () => {
    const { orderId } = await orderInStatus('shipped');
    const before = await history(orderId);
    expect(await setOrderStatusAdmin(admin, { id: orderId, from: 'shipped', to: 'ready_for_pickup' }, new Date())).toEqual({ status: 'not_allowed' });
    expect(await setOrderStatusAdmin(admin, { id: orderId, from: 'shipped', to: 'cancelled' }, new Date())).toEqual({ status: 'not_allowed' });
    expect((await orderRow(orderId)).status).toBe('shipped');
    expect(await history(orderId)).toEqual(before);
    expect(await q("SELECT count(*)::int AS n FROM admin_audit_log WHERE entity_type = 'order'")).toEqual([{ n: 0 }]);
  });

  it('un «from» desactualizado da stale sin tocar el pedido', async () => {
    const { orderId } = await orderInStatus('preparing');
    expect(await setOrderStatusAdmin(admin, { id: orderId, from: 'paid', to: 'shipped' }, new Date())).toEqual({ status: 'stale' });
    expect((await orderRow(orderId)).status).toBe('preparing');
    expect(await cancelOrderAdmin(admin, { id: orderId, from: 'paid', note: 'Sin stock real' }, new Date())).toEqual({ status: 'stale' });
    expect((await orderRow(orderId)).status).toBe('preparing');
  });

  it('cancelar un pedido pagado libera el stock y el código, reembolsa y avisa sin el motivo', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const o = await paidOrder([{ slug: 'pienso-perro-adulto', quantity: 2 }], 'BIENVENIDA10');
    const usesBefore = (await q<{ uses_count: number }>("SELECT uses_count FROM discount_codes WHERE code = 'BIENVENIDA10'"))[0]!.uses_count;
    expect((await productBySlug(p.slug)).stock).toBe(p.stock - 2);

    const r = await cancelOrderAdmin(admin, { id: o.orderId, from: 'paid', note: 'Producto dañado en almacén' }, new Date());
    expect(r).toEqual({ status: 'ok', refund: 'refunded' });
    const row = await orderRow(o.orderId);
    expect(row).toMatchObject({ status: 'cancelled', cancel_reason: 'clinic', cancelled_by: 'clinic', refund_status: 'refunded', reservation_status: 'released' });
    expect((await productBySlug(p.slug)).stock).toBe(p.stock);
    const [moved] = await q('SELECT delta, reason, stock_after FROM stock_movements WHERE order_id = $1 AND reason = $2', [o.orderId, 'order_released']);
    expect(moved).toEqual({ delta: 2, reason: 'order_released', stock_after: p.stock });
    expect((await q<{ uses_count: number }>("SELECT uses_count FROM discount_codes WHERE code = 'BIENVENIDA10'"))[0]!.uses_count).toBe(usesBefore - 1);
    const last = (await history(o.orderId)).at(-1)!;
    expect(last).toMatchObject({ to_status: 'cancelled', actor: 'clinic', admin_id: admin.id, note: 'Producto dañado en almacén' });
    expect(await outboxKinds(o.orderId)).toEqual(['order_cancelled']);
    const [mail] = await q<{ payload: { text: string; html: string } }>("SELECT payload FROM email_outbox WHERE order_id = $1", [o.orderId]);
    expect(mail!.payload.text).not.toContain('dañado');
    expect(mail!.payload.html).not.toContain('dañado');
    expect(await q("SELECT action FROM admin_audit_log WHERE entity_id = $1", [o.orderId])).toEqual([{ action: 'order.cancel' }]);
  });

  it('un pedido enviado no se puede cancelar', async () => {
    const { orderId } = await orderInStatus('shipped');
    expect(await cancelOrderAdmin(admin, { id: orderId, from: 'shipped', note: 'Lo pide el cliente' }, new Date())).toEqual({ status: 'not_allowed' });
    expect((await orderRow(orderId)).status).toBe('shipped');
  });

  it('retryRefundAdmin solo actúa con el reembolso fallido', async () => {
    const o = await paidOrder();
    expect(await retryRefundAdmin(admin, o.orderId, new Date())).toEqual({ status: 'not_failed' });
    setPaymentProviderForTests({
      ...fakeProvider,
      refund: async () => {
        throw new PaymentProviderError('http_503', true);
      },
    });
    await cancelOrderAdmin(admin, { id: o.orderId, from: 'paid', note: 'Cancelación de prueba' }, new Date());
    expect((await orderRow(o.orderId)).refund_status).toBe('pending');
    await q(`UPDATE orders SET refund_status = 'failed', refund_attempts = $2 WHERE id = $1`, [o.orderId, MAX_REFUND_ATTEMPTS]);

    setPaymentProviderForTests(null);
    const r = await retryRefundAdmin(admin, o.orderId, new Date());
    expect(r).toEqual({ status: 'ok', refund: 'refunded' });
    expect(await orderRow(o.orderId)).toMatchObject({ refund_status: 'refunded', refund_attempts: 0 });
    expect(await retryRefundAdmin(admin, o.orderId, new Date())).toEqual({ status: 'not_failed' });
    expect(await retryRefundAdmin(admin, crypto.randomUUID(), new Date())).toEqual({ status: 'not_found' });
    expect((await q<{ action: string }>('SELECT action FROM admin_audit_log WHERE entity_id = $1 ORDER BY at', [o.orderId])).map((a) => a.action)).toEqual([
      'order.cancel',
      'order.refund_retry',
    ]);
  });
});
