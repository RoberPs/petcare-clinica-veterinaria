import { eq, sql } from 'drizzle-orm';
import { discountMessage, normalizeCode, validateDiscount } from '@/domain/discount';
import { getDb } from '@/db/client';
import { findCart, type CartOwner } from '@/db/queries/cart';
import { getCheckoutConfig, getCheckoutSettings, isShopEnabled } from '@/db/queries/checkout-config';
import { recordHit } from '@/db/queries/rate-limit';
import { carts } from '@/db/schema';
import { checkPolicy, formField, policyBucket } from '@/lib/account/common';
import { logErrorCode, logger } from '@/lib/logger';
import { withNotice, type NoticeCode } from '@/lib/notice';
import { isSafeReturnTo } from '@/lib/return-to';
import { addItem, readCart, removeItem, setQuantity, type CartChange } from './cart';
import { hashCartToken, newCartToken } from './cookie';
import { findDiscountByCode } from './discount';

// Flujos de las Server Actions del carrito (contracts/routes.md), sin cookies ni redirect: la
// acción aplica el resultado. Así se prueban en integración tal cual. Nunca lanzan: un fallo
// inesperado se registra (sin datos personales) y vuelve con un aviso genérico.

export interface CartActionContext {
  customerId: string | null;
  /** Valor de la cookie pc_cart, si la hay. */
  cartToken: string | null;
}

export interface CartOutcome {
  redirectTo: string;
  /** Token nuevo de pc_cart que hay que poner (solo invitados y solo si se creó el carrito). */
  newToken: string | null;
  retentionDays: number;
}

/** return_to de "Añadir" desde el catálogo: solo /productos… (conserva filtros, búsqueda y página). */
export function shopReturnTo(value: unknown, fallback = '/productos'): string {
  if (!isSafeReturnTo(value)) return fallback;
  if (!(value === '/productos' || value.startsWith('/productos?') || value.startsWith('/productos/'))) return fallback;
  // Sin el aviso anterior: withNotice añade el nuevo.
  const [path, query = ''] = value.split('?');
  const params = new URLSearchParams(query);
  params.delete('aviso');
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path!;
}

function ownerFor(ctx: CartActionContext): { owner: CartOwner; newToken: string | null } {
  if (ctx.customerId) return { owner: { customerId: ctx.customerId }, newToken: null };
  if (ctx.cartToken) return { owner: { tokenHash: hashCartToken(ctx.cartToken) }, newToken: null };
  const token = newCartToken();
  return { owner: { tokenHash: hashCartToken(token) }, newToken: token };
}

function noticeFor(change: CartChange, added: NoticeCode): NoticeCode | null {
  switch (change.status) {
    case 'ok':
    case 'removed':
      return added;
    case 'adjusted':
      return 'carrito-ajustado';
    case 'unavailable':
      return 'producto-agotado';
    case 'invalid':
      return null;
  }
}

const created = (change: CartChange): change is Extract<CartChange, { cartId: string }> =>
  change.status === 'ok' || change.status === 'adjusted';

/** "Añadir" (listado) y "Añadir al carrito" (ficha). */
export async function processAddToCart(form: FormData, ctx: CartActionContext): Promise<CartOutcome> {
  const back = shopReturnTo(formField(form, 'return_to'));
  try {
    const settings = await getCheckoutSettings();
    if (!settings || !(await isShopEnabled())) return { redirectTo: back, newToken: null, retentionDays: 0 };
    const { owner, newToken } = ownerFor(ctx);
    const change = await addItem({
      owner,
      productId: formField(form, 'product_id') ?? '',
      quantity: formField(form, 'quantity'),
      maxPerLine: settings.maxQtyPerLine,
    });
    const notice = noticeFor(change, 'carrito-anadido');
    return {
      redirectTo: notice ? withNotice(back, notice) : back,
      newToken: created(change) ? newToken : null,
      retentionDays: settings.cartRetentionDays,
    };
  } catch (error) {
    logger.error({ event: 'cart_add_failed', code: logErrorCode(error) });
    return { redirectTo: withNotice(back, 'carrito-error'), newToken: null, retentionDays: 0 };
  }
}

/**
 * "Comprar ahora" (US8): sustituye el carrito `direct` del mismo dueño por este producto y va al
 * checkout. El carrito principal no se toca y el directo nunca lleva código de descuento.
 */
export async function processBuyNow(form: FormData, ctx: CartActionContext): Promise<CartOutcome> {
  const back = shopReturnTo(formField(form, 'return_to'));
  try {
    const settings = await getCheckoutSettings();
    if (!settings || !(await isShopEnabled())) return { redirectTo: back, newToken: null, retentionDays: 0 };
    const { owner, newToken } = ownerFor(ctx);
    // El carrito direct no admite código: lo garantiza el CHECK carts_direct_no_discount.
    const change = await getDb().transaction((tx) =>
      addItem(
        {
          owner,
          productId: formField(form, 'product_id') ?? '',
          quantity: formField(form, 'quantity'),
          maxPerLine: settings.maxQtyPerLine,
          kind: 'direct',
          replace: true,
        },
        tx,
      ),
    );
    if (!created(change)) {
      const notice = noticeFor(change, 'carrito-anadido');
      return { redirectTo: notice ? withNotice(back, notice) : back, newToken: null, retentionDays: 0 };
    }
    const checkout = '/finalizar-compra?directa=1';
    return {
      redirectTo: change.status === 'adjusted' ? withNotice(checkout, 'carrito-ajustado') : checkout,
      newToken,
      retentionDays: settings.cartRetentionDays,
    };
  } catch (error) {
    logger.error({ event: 'cart_buy_now_failed', code: logErrorCode(error) });
    return { redirectTo: withNotice(back, 'carrito-error'), newToken: null, retentionDays: 0 };
  }
}

/** Cambiar la cantidad de una línea en /carrito (0 = eliminar). */
export async function processUpdateCartLine(form: FormData, ctx: CartActionContext): Promise<CartOutcome> {
  const back = '/carrito';
  try {
    const settings = await getCheckoutSettings();
    if (!settings || !(await isShopEnabled()) || (!ctx.customerId && !ctx.cartToken)) {
      return { redirectTo: back, newToken: null, retentionDays: 0 };
    }
    const change = await setQuantity({
      owner: ownerFor(ctx).owner,
      productId: formField(form, 'product_id') ?? '',
      quantity: formField(form, 'quantity'),
      maxPerLine: settings.maxQtyPerLine,
    });
    const notice = noticeFor(change, 'carrito-actualizado');
    return { redirectTo: notice ? withNotice(back, notice) : back, newToken: null, retentionDays: 0 };
  } catch (error) {
    logger.error({ event: 'cart_update_failed', code: logErrorCode(error) });
    return { redirectTo: withNotice(back, 'carrito-error'), newToken: null, retentionDays: 0 };
  }
}

/** "Eliminar" en /carrito. */
export async function processRemoveCartLine(form: FormData, ctx: CartActionContext): Promise<CartOutcome> {
  const back = '/carrito';
  try {
    if (!(await isShopEnabled()) || (!ctx.customerId && !ctx.cartToken)) return { redirectTo: back, newToken: null, retentionDays: 0 };
    await removeItem({ owner: ownerFor(ctx).owner, productId: formField(form, 'product_id') ?? '' });
    return { redirectTo: withNotice(back, 'carrito-actualizado'), newToken: null, retentionDays: 0 };
  } catch (error) {
    logger.error({ event: 'cart_remove_failed', code: logErrorCode(error) });
    return { redirectTo: withNotice(back, 'carrito-error'), newToken: null, retentionDays: 0 };
  }
}

// ---------- Códigos de descuento (US9, D12) ----------

export interface DiscountContext extends CartActionContext {
  ip: string;
  now: Date;
}

export type DiscountResult =
  | { status: 'ok' }
  | { status: 'invalid'; fieldErrors: { code: string }; values: { code: string } }
  | { status: 'rate_limited'; retryMinutes: number }
  | { status: 'error' };

const NEED_ITEMS = 'Añade algún producto al carrito antes de aplicar un código';

/** "Aplicar" el código en /carrito. Cada intento cuenta para discount_origin (anti-adivinanza). */
export async function processApplyDiscount(form: FormData, ctx: DiscountContext): Promise<DiscountResult> {
  const typed = (formField(form, 'code') ?? '').slice(0, 60);
  const invalid = (message: string): DiscountResult => ({ status: 'invalid', fieldErrors: { code: message }, values: { code: typed } });
  try {
    if (!(await isShopEnabled())) return { status: 'error' };
    const bucket = policyBucket('discount_origin', ctx.ip);
    const retryMinutes = await checkPolicy('discount_origin', bucket, ctx.now);
    if (retryMinutes !== null) return { status: 'rate_limited', retryMinutes };
    if (typed.trim() === '') return invalid('Escribe el código de descuento');
    await recordHit(bucket, ctx.now);
    const code = normalizeCode(typed);
    if (!code) return invalid('El código debe tener de 3 a 20 letras o números');
    if (!ctx.customerId && !ctx.cartToken) return invalid(NEED_ITEMS);
    const config = await getCheckoutConfig();
    const cart = await findCart(ownerFor(ctx).owner, 'main');
    if (!config || !cart) return invalid(NEED_ITEMS);
    const view = await readCart({ ...cart, discountCodeId: null }, config, ctx.now);
    if (!view.canCheckout) return invalid(NEED_ITEMS);
    const row = await findDiscountByCode(code);
    const check = validateDiscount(row, view.totals.subtotalCents, ctx.now);
    if (!check.ok) return invalid(discountMessage(check.reason, row));
    await getDb().update(carts).set({ discountCodeId: row!.id, updatedAt: sql`now()` }).where(eq(carts.id, cart.id));
    return { status: 'ok' };
  } catch (error) {
    logger.error({ event: 'discount_apply_failed', code: logErrorCode(error) });
    return { status: 'error' };
  }
}

/** "Quitar" el código. */
export async function processRemoveDiscount(ctx: CartActionContext): Promise<CartOutcome> {
  const back = '/carrito';
  try {
    if (!(await isShopEnabled()) || (!ctx.customerId && !ctx.cartToken)) return { redirectTo: back, newToken: null, retentionDays: 0 };
    const cart = await findCart(ownerFor(ctx).owner, 'main');
    if (cart) await getDb().update(carts).set({ discountCodeId: null, updatedAt: sql`now()` }).where(eq(carts.id, cart.id));
    return { redirectTo: withNotice(back, 'descuento-retirado'), newToken: null, retentionDays: 0 };
  } catch (error) {
    logger.error({ event: 'discount_remove_failed', code: logErrorCode(error) });
    return { redirectTo: withNotice(back, 'carrito-error'), newToken: null, retentionDays: 0 };
  }
}
