import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatEur } from '@/domain/money';
import { cartTotals } from '@/domain/pricing';
import { cartUnitCount, findCart } from '@/db/queries/cart';
import { getCheckoutConfig } from '@/db/queries/checkout-config';
import { addItem, readCart } from '@/lib/cart/cart';
import { hashCartToken, newCartToken } from '@/lib/cart/cookie';
import { processAddToCart, processBuyNow, processRemoveCartLine, processUpdateCartLine, shopReturnTo } from '@/lib/cart/flows';
import { confirmOrder } from '@/lib/checkout/confirm';
import { emitFakeEvent, fakeCompletedEvent } from '@/lib/payments/fake';
import { checkoutForm, guestCtx } from './helpers/checkout';
import { mergeGuestCart } from '@/lib/cart/merge';
import { cartLines, disableShop, makeCart, productBySlug, seedShop, setStock } from './helpers/checkout';
import { createCustomer, formData, q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Carrito (US1, D3): añadir, acotar, cookie solo al primer producto y unión al iniciar sesión.

const guest = { customerId: null, cartToken: null };

describe('carrito: añadir productos (US1)', () => {
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

  it('el primer producto crea el carrito y la cookie; el token se guarda solo como hash', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const out = await processAddToCart(formData({ product_id: p.id, return_to: '/productos?mascota=perro&pagina=2' }), guest);
    expect(out.redirectTo).toBe('/productos?mascota=perro&pagina=2&aviso=carrito-anadido');
    expect(out.newToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(out.retentionDays).toBe(30);
    const rows = await q('SELECT token_hash, customer_id FROM carts');
    expect(rows).toEqual([{ token_hash: hashCartToken(out.newToken!), customer_id: null }]);
    expect(JSON.stringify(rows)).not.toContain(out.newToken!);
    expect(await cartUnitCount({ tokenHash: hashCartToken(out.newToken!) })).toBe(1);
  });

  it('con cookie existente acumula cantidades y no crea otra cookie', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const first = await processAddToCart(formData({ product_id: p.id }), guest);
    const ctx = { customerId: null, cartToken: first.newToken };
    const second = await processAddToCart(formData({ product_id: p.id, quantity: '2', return_to: `/productos/${p.slug}` }), ctx);
    expect(second.newToken).toBeNull();
    expect(second.redirectTo).toBe(`/productos/${p.slug}?aviso=carrito-anadido`);
    expect(await cartUnitCount({ tokenHash: hashCartToken(first.newToken!) })).toBe(3);
    expect(await q('SELECT count(*)::int AS n FROM carts')).toEqual([{ n: 1 }]);
  });

  it('acota al stock y al máximo por línea con su motivo', async () => {
    const customer = await createCustomer();
    const owner = { customerId: customer.id };
    await setStock('pienso-perro-adulto', 4);
    const p = await productBySlug('pienso-perro-adulto');
    expect(await addItem({ owner, productId: p.id, quantity: '6', maxPerLine: 10 })).toMatchObject({
      status: 'adjusted',
      quantity: 4,
      reason: 'stock',
    });
    await setStock('pienso-perro-adulto', 50);
    expect(await addItem({ owner, productId: p.id, quantity: '20', maxPerLine: 10 })).toMatchObject({
      status: 'adjusted',
      quantity: 10,
      reason: 'max',
    });
    const out = await processAddToCart(formData({ product_id: p.id }), { customerId: customer.id, cartToken: null });
    expect(out.redirectTo).toBe('/productos?aviso=carrito-ajustado');
  });

  it('rechaza productos agotados o no publicados sin crear carrito ni cookie', async () => {
    await setStock('pienso-perro-adulto', 0);
    const agotado = await productBySlug('pienso-perro-adulto');
    const out = await processAddToCart(formData({ product_id: agotado.id, return_to: '/productos' }), guest);
    expect(out).toMatchObject({ redirectTo: '/productos?aviso=producto-agotado', newToken: null });

    await q(`UPDATE products SET published = false WHERE slug = 'champu-piel-sensible'`);
    const oculto = await productBySlug('champu-piel-sensible');
    expect((await processAddToCart(formData({ product_id: oculto.id }), guest)).newToken).toBeNull();
    expect(await processAddToCart(formData({ product_id: 'no-es-un-uuid' }), guest)).toMatchObject({ newToken: null });
    expect(await q('SELECT count(*)::int AS n FROM carts')).toEqual([{ n: 0 }]);
  });

  it('rechaza cantidades no válidas', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    for (const quantity of ['0', '-1', '1.5', 'dos']) {
      expect((await processAddToCart(formData({ product_id: p.id, quantity }), guest)).newToken).toBeNull();
    }
    expect(await q('SELECT count(*)::int AS n FROM carts')).toEqual([{ n: 0 }]);
  });

  it('con sections.carrito.href nulo, la acción enviada a mano no crea carrito ni cookie', async () => {
    await disableShop();
    const p = await productBySlug('pienso-perro-adulto');
    const out = await processAddToCart(formData({ product_id: p.id, return_to: '/productos' }), guest);
    expect(out).toEqual({ redirectTo: '/productos', newToken: null, retentionDays: 0 });
    expect(await q('SELECT count(*)::int AS n FROM carts')).toEqual([{ n: 0 }]);
  });

  it('return_to solo admite rutas del catálogo', () => {
    expect(shopReturnTo('/productos?q=pienso&aviso=carrito-anadido')).toBe('/productos?q=pienso');
    expect(shopReturnTo('https://ejemplo.test/productos')).toBe('/productos');
    expect(shopReturnTo('//ejemplo.test')).toBe('/productos');
    expect(shopReturnTo('/mi-cuenta')).toBe('/productos');
    expect(shopReturnTo('/productos-falsos')).toBe('/productos');
  });
});

describe('carrito: unión al iniciar sesión (D3)', () => {
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

  it('suma sin superar stock ni máximo y borra el carrito de invitado', async () => {
    const customer = await createCustomer();
    await setStock('pienso-perro-adulto', 5);
    const token = newCartToken();
    await makeCart({
      tokenHash: hashCartToken(token),
      items: [
        { slug: 'pienso-perro-adulto', quantity: 3 },
        { slug: 'champu-piel-sensible', quantity: 9 },
      ],
    });
    const mine = await makeCart({
      customerId: customer.id,
      items: [
        { slug: 'pienso-perro-adulto', quantity: 4 },
        { slug: 'champu-piel-sensible', quantity: 4 },
      ],
    });
    const result = await mergeGuestCart(customer.id, token);
    expect(result).toEqual({ merged: 2, adjusted: 2 });
    expect(await cartLines(mine)).toEqual([
      { slug: 'pienso-perro-adulto', quantity: 5 },
      { slug: 'champu-piel-sensible', quantity: 10 },
    ]);
    expect(await findCart({ tokenHash: hashCartToken(token) }, 'main')).toBeNull();
  });

  it('crea el carrito de la cuenta si no tenía y conserva el código del invitado', async () => {
    const customer = await createCustomer();
    const token = newCartToken();
    await makeCart({ tokenHash: hashCartToken(token), items: [{ slug: 'pienso-perro-adulto', quantity: 1 }], discountCode: 'BIENVENIDA10' });
    await mergeGuestCart(customer.id, token);
    const cart = await findCart({ customerId: customer.id }, 'main');
    const [code] = await q('SELECT code FROM discount_codes WHERE id = $1', [cart!.discountCodeId]);
    expect(code!.code).toBe('BIENVENIDA10');
  });

  it('conserva el código del cliente si ya tenía uno', async () => {
    const customer = await createCustomer();
    const token = newCartToken();
    await makeCart({ tokenHash: hashCartToken(token), items: [{ slug: 'pienso-perro-adulto', quantity: 1 }], discountCode: 'BIENVENIDA10' });
    await makeCart({ customerId: customer.id, items: [{ slug: 'champu-piel-sensible', quantity: 1 }], discountCode: 'PETCARE5' });
    await mergeGuestCart(customer.id, token);
    const cart = await findCart({ customerId: customer.id }, 'main');
    const [code] = await q('SELECT code FROM discount_codes WHERE id = $1', [cart!.discountCodeId]);
    expect(code!.code).toBe('PETCARE5');
  });

  it('sin carrito de invitado no hace nada', async () => {
    const customer = await createCustomer();
    expect(await mergeGuestCart(customer.id, newCartToken())).toEqual({ merged: 0, adjusted: 0 });
    expect(await q('SELECT count(*)::int AS n FROM carts')).toEqual([{ n: 0 }]);
  });
});

describe('carrito: revisión con datos actuales (US2, FR-006)', () => {
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

  const now = new Date('2026-11-12T10:00:00Z');

  async function view(cartId: string) {
    const config = await getCheckoutConfig();
    const [cart] = await q('SELECT id FROM carts WHERE id = $1', [cartId]);
    const row = await findCartById(cart!.id);
    return readCart(row!, config!, now);
  }

  async function findCartById(id: string) {
    const [r] = await q<{ customer_id: string | null; token_hash: string | null }>('SELECT customer_id, token_hash FROM carts WHERE id = $1', [id]);
    return findCart(r!.customer_id ? { customerId: r!.customer_id } : { tokenHash: r!.token_hash! }, 'main');
  }

  it('precio cambiado: aviso "antes X, ahora Y", precio actual y el aviso se muestra una vez', async () => {
    const p = await productBySlug('pienso-perro-adulto');
    const cartId = await makeCart({ items: [{ slug: p.slug, quantity: 2, seenPriceCents: p.price_cents - 100 }] });
    const v = await view(cartId);
    expect(v.lines[0]!.notices).toEqual([
      `El precio ha cambiado: antes ${formatEur(p.price_cents - 100)}, ahora ${formatEur(p.price_cents)}`,
    ]);
    expect(v.lines[0]!.unitPriceCents).toBe(p.price_cents);
    expect(v.totals.subtotalCents).toBe(p.price_cents * 2);
    expect((await view(cartId)).lines[0]!.notices).toEqual([]);
  });

  it('stock menor: ajusta la cantidad en la base y avisa "Solo quedan N unidades"', async () => {
    const cartId = await makeCart({ items: [{ slug: 'pienso-perro-adulto', quantity: 5 }] });
    await setStock('pienso-perro-adulto', 2);
    const v = await view(cartId);
    expect(v.lines[0]).toMatchObject({ quantity: 2, maxQuantity: 2, notices: ['Solo quedan 2 unidades'] });
    expect(await cartLines(cartId)).toEqual([{ slug: 'pienso-perro-adulto', quantity: 2 }]);
  });

  it('despublicado o agotado: línea no disponible y fuera del total', async () => {
    const cartId = await makeCart({
      items: [
        { slug: 'pienso-perro-adulto', quantity: 1 },
        { slug: 'champu-piel-sensible', quantity: 1 },
        { slug: 'pelota-caucho-flotante', quantity: 1 },
      ],
    });
    await setStock('pienso-perro-adulto', 0);
    await q(`UPDATE products SET published = false WHERE slug = 'champu-piel-sensible'`);
    const v = await view(cartId);
    expect(v.lines.map((l) => l.unavailable)).toEqual([true, true, false]);
    expect(v.lines[0]!.notices).toEqual(['Este producto ya no está disponible']);
    const pelota = await productBySlug('pelota-caucho-flotante');
    expect(v.totals.subtotalCents).toBe(pelota.price_cents);
    expect(v.canCheckout).toBe(true);
  });

  it('los totales son los de cartTotals con el envío más barato', async () => {
    const cartId = await makeCart({
      items: [
        { slug: 'pienso-perro-adulto', quantity: 2 },
        { slug: 'champu-piel-sensible', quantity: 1 },
      ],
    });
    const a = await productBySlug('pienso-perro-adulto');
    const b = await productBySlug('champu-piel-sensible');
    const v = await view(cartId);
    expect(v.totals).toEqual(
      cartTotals(
        [
          { unitPriceCents: a.price_cents, quantity: 2, vatRate: a.vat_rate },
          { unitPriceCents: b.price_cents, quantity: 1, vatRate: b.vat_rate },
        ],
        null,
        { costCents: 0, vatRate: 21 },
      ),
    );
    expect(v.shipping).toEqual({ name: 'Envío a domicilio', costCents: 0 });
  });

  it('cambiar la cantidad (0 = eliminar) y eliminar una línea', async () => {
    const customer = await createCustomer();
    const ctx = { customerId: customer.id, cartToken: null };
    const cartId = await makeCart({
      customerId: customer.id,
      items: [
        { slug: 'pienso-perro-adulto', quantity: 1 },
        { slug: 'champu-piel-sensible', quantity: 1 },
      ],
    });
    const a = await productBySlug('pienso-perro-adulto');
    const b = await productBySlug('champu-piel-sensible');
    expect((await processUpdateCartLine(formData({ product_id: a.id, quantity: '3' }), ctx)).redirectTo).toBe(
      '/carrito?aviso=carrito-actualizado',
    );
    expect((await processUpdateCartLine(formData({ product_id: a.id, quantity: '99' }), ctx)).redirectTo).toBe(
      '/carrito?aviso=carrito-ajustado',
    );
    expect(await cartLines(cartId)).toEqual([
      { slug: 'pienso-perro-adulto', quantity: 10 },
      { slug: 'champu-piel-sensible', quantity: 1 },
    ]);
    await processUpdateCartLine(formData({ product_id: b.id, quantity: '0' }), ctx);
    expect(await cartLines(cartId)).toEqual([{ slug: 'pienso-perro-adulto', quantity: 10 }]);
    expect((await processRemoveCartLine(formData({ product_id: a.id }), ctx)).redirectTo).toBe('/carrito?aviso=carrito-actualizado');
    expect(await cartLines(cartId)).toEqual([]);
  });

  it('no se puede tocar el carrito de otro', async () => {
    const owner = await createCustomer();
    const other = await createCustomer();
    const cartId = await makeCart({ customerId: owner.id, items: [{ slug: 'pienso-perro-adulto', quantity: 1 }] });
    const a = await productBySlug('pienso-perro-adulto');
    await processRemoveCartLine(formData({ product_id: a.id }), { customerId: other.id, cartToken: null });
    await processUpdateCartLine(formData({ product_id: a.id, quantity: '5' }), { customerId: other.id, cartToken: null });
    expect(await cartLines(cartId)).toEqual([{ slug: 'pienso-perro-adulto', quantity: 1 }]);
  });
});

describe('carrito: "Comprar ahora" (US8)', () => {
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

  it('crea el carrito direct, va al checkout y no toca el principal', async () => {
    const a = await productBySlug('pienso-perro-adulto');
    const b = await productBySlug('champu-piel-sensible');
    const token = newCartToken();
    const mainId = await makeCart({ tokenHash: hashCartToken(token), items: [{ slug: b.slug, quantity: 3 }], discountCode: 'BIENVENIDA10' });
    const ctx = { customerId: null, cartToken: token };
    const out = await processBuyNow(formData({ product_id: a.id, quantity: '2', return_to: `/productos/${a.slug}` }), ctx);
    expect(out.redirectTo).toBe('/finalizar-compra?directa=1');
    expect(out.newToken).toBeNull();
    const direct = await findCart({ tokenHash: hashCartToken(token) }, 'direct');
    expect(direct).not.toBeNull();
    expect(direct!.discountCodeId).toBeNull();
    expect(await cartLines(direct!.id)).toEqual([{ slug: a.slug, quantity: 2 }]);
    expect(await cartLines(mainId)).toEqual([{ slug: b.slug, quantity: 3 }]);

    // Un segundo "Comprar ahora" sustituye el contenido del direct.
    await processBuyNow(formData({ product_id: b.id, quantity: '1' }), ctx);
    expect(await cartLines(direct!.id)).toEqual([{ slug: b.slug, quantity: 1 }]);
    expect(await q("SELECT count(*)::int AS n FROM carts WHERE kind = 'direct'")).toEqual([{ n: 1 }]);
    expect(await cartLines(mainId)).toEqual([{ slug: b.slug, quantity: 3 }]);
  });

  it('el direct nunca lleva código: lo impide la base (carts_direct_no_discount)', async () => {
    const a = await productBySlug('pienso-perro-adulto');
    const out = await processBuyNow(formData({ product_id: a.id }), guest);
    const direct = (await findCart({ tokenHash: hashCartToken(out.newToken!) }, 'direct'))!;
    expect(direct.discountCodeId).toBeNull();
    await expect(
      q("UPDATE carts SET discount_code_id = (SELECT id FROM discount_codes WHERE code = 'BIENVENIDA10') WHERE id = $1", [direct.id]),
    ).rejects.toThrow(/carts_direct_no_discount/);
  });

  it('producto agotado: vuelve a la ficha con el aviso y sin carrito', async () => {
    const a = await productBySlug('pienso-perro-adulto');
    await setStock(a.slug, 0);
    const out = await processBuyNow(formData({ product_id: a.id, return_to: `/productos/${a.slug}` }), guest);
    expect(out.redirectTo).toBe(`/productos/${a.slug}?aviso=producto-agotado`);
    expect(out.newToken).toBeNull();
    expect(await q('SELECT count(*)::int AS n FROM carts')).toEqual([{ n: 0 }]);
  });

  it('pagar el pedido directo vacía solo el direct', async () => {
    const a = await productBySlug('pienso-perro-adulto');
    const b = await productBySlug('champu-piel-sensible');
    const first = await processAddToCart(formData({ product_id: b.id, quantity: '2' }), guest);
    const ctx = { customerId: null, cartToken: first.newToken };
    await processBuyNow(formData({ product_id: a.id }), ctx);
    const r = await confirmOrder(checkoutForm({ cart: 'direct' }), guestCtx(first.newToken!));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const [pay] = await q<{ provider_session_id: string; amount_cents: number }>('SELECT provider_session_id, amount_cents FROM payments WHERE order_id = $1', [r.orderId]);
    await emitFakeEvent(fakeCompletedEvent(pay!.provider_session_id, pay!.amount_cents, r.orderId));
    const tokenHash = hashCartToken(first.newToken!);
    const direct = (await findCart({ tokenHash }, 'direct'))!;
    const main = (await findCart({ tokenHash }, 'main'))!;
    expect(await cartLines(direct.id)).toEqual([]);
    expect(await cartLines(main.id)).toEqual([{ slug: b.slug, quantity: 2 }]);
  });
});
