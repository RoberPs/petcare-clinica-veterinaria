import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { confirmOrder } from '@/lib/checkout/confirm';
import { EXIT, runOrdersCli } from '@/lib/orders/cli';
import { emitFakeEvent, fakeCompletedEvent } from '@/lib/payments/fake';
import { cardOrder, checkoutForm, guestCart, guestCtx, orderRow, productBySlug, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// CLI de pedidos (contracts/cli.md): list, show, set-status, deliver y cancel con sus códigos de salida.

async function run(...args: string[]): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await runOrdersCli(args, (l) => lines.push(l), new Date());
  return { code, text: lines.join('\n') };
}

async function paidOrder() {
  const o = await cardOrder([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
  await emitFakeEvent(fakeCompletedEvent(o.sessionId, o.amountCents, o.orderId));
  return { ...o, number: (await orderRow(o.orderId)).number as string };
}

describe('npm run orders', () => {
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

  it('sin orden o con una desconocida: uso y código 1', async () => {
    expect((await run()).code).toBe(EXIT.usage);
    const r = await run('borrar-todo');
    expect(r.code).toBe(EXIT.usage);
    expect(r.text).toContain('Uso: npm run orders');
  });

  it('list y show', async () => {
    const o = await paidOrder();
    const list = await run('list');
    expect(list.code).toBe(0);
    expect(list.text).toMatch(new RegExp(`^${o.number} \\| .+ \\| Pagado \\| Tarjeta \\| .+€$`));
    expect((await run('list', '--status', 'cancelled')).text).toBe('No hay pedidos.');
    expect((await run('list', '--status', 'raro')).code).toBe(EXIT.usage);

    const show = await run('show', o.number);
    expect(show.code).toBe(0);
    expect(show.text).toContain(`Pedido ${o.number}`);
    expect(show.text).toContain('Estado: Pagado');
    expect(show.text).toContain('comprador@example.test');
    expect(show.text).toContain('Historial:');
  });

  it('set-status válido e inválido, y número inexistente', async () => {
    const o = await paidOrder();
    const ok = await run('set-status', o.number, 'shipped');
    expect(ok).toEqual({ code: 0, text: `${o.number}: Pagado → Enviado` });
    expect(await q('SELECT actor FROM order_status_history WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1', [o.orderId])).toEqual([{ actor: 'clinic' }]);

    expect((await run('set-status', o.number, 'delivered')).code).toBe(0);
    const bad = await run('set-status', o.number, 'shipped');
    expect(bad).toEqual({ code: EXIT.transition, text: 'Transición no permitida: Entregado → Enviado' });
    expect((await run('set-status', o.number, 'paid')).code).toBe(EXIT.usage);

    expect((await run('show', 'PC-999999')).code).toBe(EXIT.notFound);
    expect((await run('set-status', 'PC-999999', 'shipped')).code).toBe(EXIT.notFound);
    expect((await run('cancel', 'PC-999999')).code).toBe(EXIT.notFound);
  });

  it('deliver de un pedido en clínica: paid_at, reserva committed y uso del código mantenido', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const { token } = await guestCart([{ slug: p.slug, quantity: 2 }], { discountCode: 'BIENVENIDA10' });
    const r = await confirmOrder(checkoutForm({ shipping_method: 'recogida', payment_method: 'in_clinic' }), guestCtx(token));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const before = await orderRow(r.orderId);
    expect(before).toMatchObject({ status: 'pending_payment', paid_at: null, reservation_status: 'held', discount_code: 'BIENVENIDA10' });

    const out = await run('deliver', before.number);
    expect(out).toEqual({ code: 0, text: `${before.number}: Pendiente de pago → Entregado` });
    const after = await orderRow(r.orderId);
    expect(after.status).toBe('delivered');
    expect(after.paid_at).not.toBeNull();
    expect(after.reservation_status).toBe('committed');
    expect((await productBySlug(p.slug)).stock).toBe(p.stock - 2);
    expect(await q(`SELECT uses_count FROM discount_codes WHERE code = 'BIENVENIDA10'`)).toEqual([{ uses_count: 1 }]);
  });

  it('cancel de un pagado: stock devuelto y reembolso', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const o = await paidOrder();
    const out = await run('cancel', o.number, '--note', 'sin existencias en almacén');
    expect(out.code).toBe(0);
    expect(out.text).toBe(`${o.number}: Pagado → Cancelado. Reembolso hecho.`);
    expect(await orderRow(o.orderId)).toMatchObject({ status: 'cancelled', cancel_reason: 'clinic', refund_status: 'refunded' });
    expect((await productBySlug(p.slug)).stock).toBe(p.stock);
    expect(await q('SELECT note FROM order_status_history WHERE order_id = $1 AND to_status = $2', [o.orderId, 'cancelled'])).toEqual([
      { note: 'sin existencias en almacén' },
    ]);
    // Cancelar otra vez: transición no permitida.
    expect((await run('cancel', o.number)).code).toBe(EXIT.transition);
  });

  // Feature 008 (G11): la CLI también avisa al comprador, sin autor del panel.
  it('set-status a shipped desde la CLI encola order_status y deja admin_id nulo', async () => {
    const o = await paidOrder();
    await q('DELETE FROM email_outbox WHERE order_id = $1', [o.orderId]);
    expect((await run('set-status', o.number, 'shipped')).code).toBe(0);
    const kinds = (await q<{ kind: string }>('SELECT kind FROM email_outbox WHERE order_id = $1', [o.orderId])).map((r) => r.kind);
    expect(kinds).toEqual(['order_status']);
    expect(await q('SELECT actor, admin_id FROM order_status_history WHERE order_id = $1 AND to_status = $2', [o.orderId, 'shipped'])).toEqual([
      { actor: 'clinic', admin_id: null },
    ]);
  });
});
