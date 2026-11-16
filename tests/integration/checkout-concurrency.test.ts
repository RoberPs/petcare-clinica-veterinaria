import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { confirmOrder } from '@/lib/checkout/confirm';
import {
  cartLines,
  checkoutForm,
  checkoutToken,
  customerCtx,
  guestCart,
  guestCtx,
  makeCart,
  orderRow,
  outboxKinds,
  productBySlug,
  seedShop,
  setStock,
} from './helpers/checkout';
import { createCustomer, q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Confirmación del pedido (US3): concurrencia sobre la última unidad (SC-002), idempotencia por
// submission_id y un solo pedido pendiente por carrito (FR-012, D10).

describe('confirmOrder', () => {
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

  it('crea el pedido con la reserva, el número y la sesión de la pasarela simulada', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const { token } = await guestCart([{ slug: p.slug, quantity: 2 }]);
    const result = await confirmOrder(checkoutForm(), guestCtx(token));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.url).toMatch(/\/pago-simulado\/fake_[0-9a-f-]{36}$/);
    const order = await orderRow(result.orderId);
    expect(order).toMatchObject({
      number: 'PC-000001',
      status: 'pending_payment',
      reservation_status: 'held',
      payment_method: 'card',
      subtotal_cents: p.price_cents * 2,
      total_cents: p.price_cents * 2,
      contact_email: 'comprador@example.test',
      customer_id: null,
    });
    expect((await productBySlug(p.slug)).stock).toBe(p.stock - 2);
    expect(await q('SELECT provider, status, amount_cents FROM payments')).toEqual([{ provider: 'fake', status: 'open', amount_cents: p.price_cents * 2 }]);
    expect(await q('SELECT from_status, to_status, actor FROM order_status_history')).toEqual([
      { from_status: null, to_status: 'pending_payment', actor: 'customer' },
    ]);
    // Con tarjeta no hay correo hasta el pago.
    expect(await outboxKinds(result.orderId)).toEqual([]);
  });

  it('10 confirmaciones en paralelo sobre la última unidad: un pedido y 9 sin stock (SC-002)', async () => {
    await setStock('pienso-perro-adulto', 1);
    const carts = await Promise.all(Array.from({ length: 10 }, () => guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }])));
    const results = await Promise.all(
      carts.map((c, i) => confirmOrder(checkoutForm({ email: `comprador${i}@example.test` }), guestCtx(c.token))),
    );
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'stock_unavailable')).toHaveLength(9);
    expect((await productBySlug('pienso-perro-adulto')).stock).toBe(0);
    expect(await q('SELECT count(*)::int AS n FROM orders')).toEqual([{ n: 1 }]);
  });

  it('varias líneas en paralelo sin interbloqueo y sin stock negativo', async () => {
    await setStock('pienso-perro-adulto', 3);
    await setStock('champu-piel-sensible', 3);
    const a = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        guestCart(
          i % 2 === 0
            ? [{ slug: 'pienso-perro-adulto', quantity: 1 }, { slug: 'champu-piel-sensible', quantity: 1 }]
            : [{ slug: 'champu-piel-sensible', quantity: 1 }, { slug: 'pienso-perro-adulto', quantity: 1 }],
        ),
      ),
    );
    const results = await Promise.all(a.map((c, i) => confirmOrder(checkoutForm({ email: `p${i}@example.test` }), guestCtx(c.token))));
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(3);
    const stock = await q<{ stock: number }>(`SELECT stock FROM products WHERE slug IN ('pienso-perro-adulto', 'champu-piel-sensible')`);
    expect(stock.every((s) => s.stock === 0)).toBe(true);
  });

  it('el reenvío con el mismo submission_id devuelve el mismo pedido', async () => {
    const { token } = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    const formToken = checkoutToken();
    const first = await confirmOrder(checkoutForm({ token: formToken }), guestCtx(token));
    const second = await confirmOrder(checkoutForm({ token: formToken }), guestCtx(token));
    expect(first.status === 'ok' && second.status === 'ok' && first.orderId === second.orderId).toBe(true);
    expect(first.status === 'ok' && second.status === 'ok' && first.url === second.url).toBe(true);
    expect(await q('SELECT count(*)::int AS n FROM orders')).toEqual([{ n: 1 }]);
  });

  it('FR-012: misma huella reutiliza el pedido y su checkout_url', async () => {
    const { token } = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    const first = await confirmOrder(checkoutForm(), guestCtx(token));
    const second = await confirmOrder(checkoutForm({ city: 'Alcalá de Henares' }), guestCtx(token));
    expect(first.status === 'ok' && second.status === 'ok' && first.orderId === second.orderId && first.url === second.url).toBe(true);
    const order = await orderRow((first as { orderId: string }).orderId);
    expect(order.city).toBe('Alcalá de Henares');
    expect(await q('SELECT count(*)::int AS n FROM orders')).toEqual([{ n: 1 }]);
  });

  it('FR-012: huella distinta cancela el anterior (replaced, sin correo) y crea otro', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const { token, cartId } = await guestCart([{ slug: p.slug, quantity: 1 }]);
    const first = await confirmOrder(checkoutForm(), guestCtx(token));
    await q('UPDATE cart_items SET quantity = 2 WHERE cart_id = $1', [cartId]);
    const second = await confirmOrder(checkoutForm(), guestCtx(token));
    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    const old = await orderRow((first as { orderId: string }).orderId);
    expect(old).toMatchObject({ status: 'cancelled', cancel_reason: 'replaced', reservation_status: 'released' });
    expect(await outboxKinds(old.id)).toEqual([]);
    expect((await productBySlug(p.slug)).stock).toBe(p.stock - 2);
  });

  it('límite por origen (checkout_origin): 5 pedidos cada 10 minutos', async () => {
    const ctx = { ip: '192.0.2.50', now: new Date(), customer: null };
    const results = [];
    for (let i = 0; i < 6; i++) {
      const { token } = await guestCart([{ slug: 'pelota-caucho-flotante', quantity: 1 }]);
      results.push(await confirmOrder(checkoutForm({ email: `o${i}@example.test` }), { ...ctx, cartToken: token }));
    }
    expect(results.slice(0, 5).every((r) => r.status === 'ok')).toBe(true);
    expect(results[5]!.status).toBe('rate_limited');
  });

  it('max_pending_per_customer: el cuarto pedido pendiente se rechaza', async () => {
    const customer = await createCustomer();
    for (let i = 0; i < 3; i++) {
      await q('DELETE FROM carts WHERE customer_id = $1', [customer.id]);
      await makeCart({ customerId: customer.id, items: [{ slug: 'pelota-caucho-flotante', quantity: i + 1 }] });
      expect((await confirmOrder(checkoutForm({ email: undefined }), customerCtx(customer))).status).toBe('ok');
    }
    await q('DELETE FROM carts WHERE customer_id = $1', [customer.id]);
    await makeCart({ customerId: customer.id, items: [{ slug: 'pelota-caucho-flotante', quantity: 5 }] });
    expect((await confirmOrder(checkoutForm({ email: undefined }), customerCtx(customer))).status).toBe('limit_reached');
  });

  it('precio cambiado entre el checkout y la confirmación: vuelta al carrito', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const { token } = await guestCart([{ slug: p.slug, quantity: 1 }]);
    const result = await confirmOrder(checkoutForm({ expected_total: String(p.price_cents - 1) }), guestCtx(token));
    expect(result).toEqual({ status: 'cart_changed', url: '/carrito?aviso=carrito-ajustado' });
  });

  it('stock insuficiente al confirmar: ajusta el carrito y vuelve a él', async () => {
    const { token, cartId } = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 3 }]);
    await setStock('pienso-perro-adulto', 2);
    // readCart ajusta antes de reservar: el comprador ve el cambio en el carrito.
    const result = await confirmOrder(checkoutForm(), guestCtx(token));
    expect(result.status === 'cart_changed' || result.status === 'stock_unavailable').toBe(true);
    expect(await cartLines(cartId)).toEqual([{ slug: 'pienso-perro-adulto', quantity: 2 }]);
  });

  it('errores de validación junto al campo y sin pedido', async () => {
    const { token } = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    const result = await confirmOrder(checkoutForm({ email: 'no', postal_code: '99999' }), guestCtx(token));
    expect(result).toMatchObject({ status: 'invalid', fieldErrors: { email: 'Escribe un correo válido', postal_code: 'Código postal no válido' } });
    expect(await q('SELECT count(*)::int AS n FROM orders')).toEqual([{ n: 0 }]);
  });

  it('token caducado o campo trampa: sin pedido', async () => {
    const { token } = await guestCart([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
    expect((await confirmOrder(checkoutForm({ token: 'x.y' }), guestCtx(token))).status).toBe('expired_token');
    expect((await confirmOrder(checkoutForm({ web: 'http://spam' }), guestCtx(token))).status).toBe('empty');
    expect(await q('SELECT count(*)::int AS n FROM orders')).toEqual([{ n: 0 }]);
  });
});
