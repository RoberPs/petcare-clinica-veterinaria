import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findCart } from '@/db/queries/cart';
import { getCheckoutConfig } from '@/db/queries/checkout-config';
import { discountSchema } from '@/domain/store-schemas';
import { createDiscountCode, setDiscountEnabled } from '@/lib/admin/discounts';
import { readCart } from '@/lib/cart/cart';
import { hashCartToken } from '@/lib/cart/cookie';
import { confirmOrder } from '@/lib/checkout/confirm';
import { adminCtx, checkoutForm, guestCart, guestCtx, orderRow, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Códigos de descuento desde el panel (US6, G12): alta con auditoría, código repetido, desactivar
// (se retira del carrito con aviso y los pedidos conservan su descuento) y reactivar uno caducado.

const SLUG = 'pienso-perro-adulto';
let admin: { id: string };

async function viewFor(token: string) {
  const config = (await getCheckoutConfig())!;
  const cart = (await findCart({ tokenHash: hashCartToken(token) }, 'main'))!;
  return readCart(cart, config, new Date());
}

const create = (raw: Record<string, string>) => createDiscountCode(admin, discountSchema.parse({ kind: 'percent', value: '10', ...raw }), { now: new Date() });

describe('códigos de descuento del panel', () => {
  beforeAll(setupTestDb);
  beforeEach(async () => {
    await truncateAll();
    await seedShop();
    admin = await adminCtx();
  });
  afterAll(teardownTestDb);

  it('alta con su registro de auditoría', async () => {
    const r = await create({ code: 'verano10', max_uses: '100', ends_on: '2099-08-31' });
    expect(r).toMatchObject({ status: 'ok', created: true });
    const [row] = await q('SELECT code, kind, value, enabled, max_uses, uses_count FROM discount_codes WHERE code = $1', ['VERANO10']);
    expect(row).toEqual({ code: 'VERANO10', kind: 'percent', value: 10, enabled: true, max_uses: 100, uses_count: 0 });
    const [audit] = await q<{ action: string; actor_id: string; changes: Record<string, unknown> }>(
      "SELECT action, actor_id, changes FROM admin_audit_log WHERE entity_type = 'discount_code'",
    );
    expect(audit).toMatchObject({ action: 'discount.create', actor_id: admin.id });
    expect(audit!.changes).toMatchObject({ code: 'VERANO10', kind: 'percent', value: 10, maxUses: 100 });
  });

  it('un código repetido (también en minúsculas) da error de campo', async () => {
    expect(await create({ code: 'bienvenida10' })).toEqual({ status: 'invalid', fieldErrors: { code: 'Ya existe un código con ese nombre.' } });
  });

  it('desactivar lo retira del carrito con aviso y no cambia los pedidos confirmados', async () => {
    await create({ code: 'VERANO10' });
    const [{ id }] = (await q<{ id: string }>("SELECT id FROM discount_codes WHERE code = 'VERANO10'")) as [{ id: string }];
    // Un pedido ya confirmado con el código.
    const first = await guestCart([{ slug: SLUG, quantity: 2 }], { discountCode: 'VERANO10' });
    const r = await confirmOrder(checkoutForm(), guestCtx(first.token));
    expect(r.status).toBe('ok');
    const orderId = (r as { orderId: string }).orderId;
    const before = await orderRow(orderId);
    expect(before.discount_cents).toBeGreaterThan(0);
    // Otro carrito con el código aplicado.
    const other = await guestCart([{ slug: SLUG, quantity: 1 }], { discountCode: 'VERANO10' });
    expect((await viewFor(other.token)).discount?.code).toBe('VERANO10');

    expect(await setDiscountEnabled(admin, id, false, new Date())).toEqual({ status: 'ok', changed: true });
    const view = await viewFor(other.token);
    expect(view.discount).toBeNull();
    expect(view.notices.join(' ')).toContain('Este código no existe o ya no está activo.');
    const after = await orderRow(orderId);
    expect(after).toMatchObject({ discount_code: 'VERANO10', discount_cents: before.discount_cents, total_cents: before.total_cents });
    expect(await setDiscountEnabled(admin, id, false, new Date())).toEqual({ status: 'ok', changed: false });
    expect((await q<{ action: string }>("SELECT action FROM admin_audit_log WHERE entity_id = $1 ORDER BY at", [id])).map((a) => a.action)).toEqual([
      'discount.create',
      'discount.disable',
    ]);
  });

  it('reactivar un código caducado sigue sin aplicarse', async () => {
    await create({ code: 'VIEJO10' });
    const [{ id }] = (await q<{ id: string }>("SELECT id FROM discount_codes WHERE code = 'VIEJO10'")) as [{ id: string }];
    await setDiscountEnabled(admin, id, false, new Date());
    await q(`UPDATE discount_codes SET starts_at = now() - interval '10 days', ends_at = now() - interval '1 day' WHERE id = $1`, [id]);
    expect(await setDiscountEnabled(admin, id, true, new Date())).toEqual({ status: 'ok', changed: true });
    const cart = await guestCart([{ slug: SLUG, quantity: 1 }], { discountCode: 'VIEJO10' });
    const view = await viewFor(cart.token);
    expect(view.discount).toBeNull();
    expect(view.notices.join(' ')).toContain('Este código ha caducado.');
    expect(await setDiscountEnabled(admin, crypto.randomUUID(), true, new Date())).toEqual({ status: 'not_found' });
  });
});
