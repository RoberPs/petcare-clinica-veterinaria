import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findCart } from '@/db/queries/cart';
import { getCheckoutConfig } from '@/db/queries/checkout-config';
import { readCart } from '@/lib/cart/cart';
import { hashCartToken } from '@/lib/cart/cookie';
import { processApplyDiscount, processRemoveDiscount } from '@/lib/cart/flows';
import { confirmOrder } from '@/lib/checkout/confirm';
import { cancelOrder } from '@/lib/orders/cancel';
import { checkoutForm, guestCart, guestCtx, orderRow, productBySlug, seedShop } from './helpers/checkout';
import { formData, q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Códigos de descuento (US9, D12): aplicar y quitar, retirada automática con aviso, uso apartado
// al confirmar (con carrera sobre el último uso), devuelto al cancelar y límite por origen.

const SLUG = 'pienso-perro-adulto';
let ipN = 0;
const ip = () => `192.0.2.${(ipN += 1) % 250}`;

async function usesOf(code: string): Promise<number> {
  return (await q<{ uses_count: number }>('SELECT uses_count FROM discount_codes WHERE code = $1', [code]))[0]!.uses_count;
}

async function viewFor(token: string) {
  const config = (await getCheckoutConfig())!;
  const cart = (await findCart({ tokenHash: hashCartToken(token) }, 'main'))!;
  return readCart(cart, config, new Date());
}

describe('códigos de descuento', () => {
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

  it('aplicar (sin distinguir mayúsculas ni espacios) y quitar', async () => {
    const p = await productBySlug(SLUG);
    const { token, cartId } = await guestCart([{ slug: SLUG, quantity: 2 }]);
    const ctx = { customerId: null, cartToken: token, ip: ip(), now: new Date() };
    expect(await processApplyDiscount(formData({ code: '  bienvenida10 ' }), ctx)).toEqual({ status: 'ok' });
    const view = await viewFor(token);
    expect(view.discount?.code).toBe('BIENVENIDA10');
    expect(view.totals.discountCents).toBe(Math.round(p.price_cents * 2 * 0.1));

    const out = await processRemoveDiscount({ customerId: null, cartToken: token });
    expect(out.redirectTo).toBe('/carrito?aviso=descuento-retirado');
    expect(await q('SELECT discount_code_id FROM carts WHERE id = $1', [cartId])).toEqual([{ discount_code_id: null }]);
  });

  it('inexistente, caducado y mínimo no alcanzado: error en el campo y sin código en el carrito', async () => {
    const { token, cartId } = await guestCart([{ slug: SLUG, quantity: 1 }]);
    const ctx = { customerId: null, cartToken: token, ip: ip(), now: new Date() };
    expect(await processApplyDiscount(formData({ code: 'NOEXISTE' }), ctx)).toEqual({
      status: 'invalid',
      fieldErrors: { code: 'Este código no existe o ya no está activo.' },
      values: { code: 'NOEXISTE' },
    });
    await q(`UPDATE discount_codes SET ends_at = now() - interval '1 day' WHERE code = 'BIENVENIDA10'`);
    const expired = await processApplyDiscount(formData({ code: 'BIENVENIDA10' }), ctx);
    expect(expired.status === 'invalid' && expired.fieldErrors.code).toBe('Este código ha caducado.');

    const p = await productBySlug(SLUG);
    await q(`UPDATE discount_codes SET min_subtotal_cents = $1 WHERE code = 'PETCARE5'`, [p.price_cents + 1]);
    const min = await processApplyDiscount(formData({ code: 'PETCARE5' }), ctx);
    expect(min.status === 'invalid' && min.fieldErrors.code).toMatch(/^Este código requiere un pedido mínimo de \d+,\d{2} €$/);
    expect(await q('SELECT discount_code_id FROM carts WHERE id = $1', [cartId])).toEqual([{ discount_code_id: null }]);
  });

  it('se retira solo, con aviso, al dejar de cumplir el mínimo o al caducar', async () => {
    const p = await productBySlug(SLUG);
    await q(`UPDATE discount_codes SET min_subtotal_cents = $1 WHERE code = 'PETCARE5'`, [p.price_cents * 2]);
    const { token, cartId } = await guestCart([{ slug: SLUG, quantity: 2 }], { discountCode: 'PETCARE5' });
    expect((await viewFor(token)).discount?.code).toBe('PETCARE5');
    await q('UPDATE cart_items SET quantity = 1 WHERE cart_id = $1', [cartId]);
    const view = await viewFor(token);
    expect(view.discount).toBeNull();
    expect(view.notices.join(' ')).toMatch(/^Hemos quitado .+ Este código requiere un pedido mínimo de/);
    expect(await q('SELECT discount_code_id FROM carts WHERE id = $1', [cartId])).toEqual([{ discount_code_id: null }]);

    const other = await guestCart([{ slug: SLUG, quantity: 1 }], { discountCode: 'BIENVENIDA10' });
    await q(`UPDATE discount_codes SET ends_at = now() - interval '1 minute' WHERE code = 'BIENVENIDA10'`);
    const v2 = await viewFor(other.token);
    expect(v2.discount).toBeNull();
    expect(v2.notices.join(' ')).toContain('Este código ha caducado.');
  });

  it('al confirmar aparta el uso y copia código e importe; al cancelar lo devuelve', async () => {
    const { token } = await guestCart([{ slug: SLUG, quantity: 2 }], { discountCode: 'BIENVENIDA10' });
    const r = await confirmOrder(checkoutForm(), guestCtx(token));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const order = await orderRow(r.orderId);
    expect(order.discount_code).toBe('BIENVENIDA10');
    expect(order.discount_cents).toBeGreaterThan(0);
    expect(order.total_cents).toBe(order.subtotal_cents - order.discount_cents + order.shipping_cost_cents);
    const shares = await q<{ s: number }>('SELECT sum(discount_share_cents)::int AS s FROM order_items WHERE order_id = $1', [r.orderId]);
    expect(shares[0]!.s).toBe(order.discount_cents);
    expect(await usesOf('BIENVENIDA10')).toBe(1);

    await cancelOrder(r.orderId, 'customer', { reason: 'customer', now: new Date() });
    expect(await usesOf('BIENVENIDA10')).toBe(0);
  });

  it('dos pedidos sobre el último uso: uno con el código y el otro vuelve al carrito (cart_changed)', async () => {
    await q(`UPDATE discount_codes SET max_uses = 1, uses_count = 0 WHERE code = 'PETCARE5'`);
    const p = await productBySlug(SLUG);
    const qty = Math.max(1, Math.ceil(3000 / p.price_cents));
    const a = await guestCart([{ slug: SLUG, quantity: qty }], { discountCode: 'PETCARE5' });
    const b = await guestCart([{ slug: SLUG, quantity: qty }], { discountCode: 'PETCARE5' });
    const results = await Promise.all([
      confirmOrder(checkoutForm({ email: 'a@example.test' }), guestCtx(a.token)),
      confirmOrder(checkoutForm({ email: 'b@example.test' }), guestCtx(b.token)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['cart_changed', 'ok']);
    expect(await usesOf('PETCARE5')).toBe(1);
    expect(await q('SELECT count(*)::int AS n FROM orders')).toEqual([{ n: 1 }]);
    // Al carrito que perdió la carrera se le quita el código.
    const loser = results[0]!.status === 'ok' ? b : a;
    expect(await q('SELECT discount_code_id FROM carts WHERE id = $1', [loser.cartId])).toEqual([{ discount_code_id: null }]);
  });

  it('discount_origin: a partir del 11.º intento en 10 minutos → rate_limited', async () => {
    const { token } = await guestCart([{ slug: SLUG, quantity: 1 }]);
    const ctx = { customerId: null, cartToken: token, ip: '198.18.0.7', now: new Date() };
    for (let i = 0; i < 10; i++) expect((await processApplyDiscount(formData({ code: `MAL${i}XX` }), ctx)).status).toBe('invalid');
    const blocked = await processApplyDiscount(formData({ code: 'BIENVENIDA10' }), ctx);
    expect(blocked.status).toBe('rate_limited');
  });
});
