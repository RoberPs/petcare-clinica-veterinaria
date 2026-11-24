import { and, eq, sql } from 'drizzle-orm';
import { clampQuantity } from '@/domain/cart-rules';
import { formatEur } from '@/domain/money';
import { cartTotals, type CartTotals } from '@/domain/pricing';
import { getDb, type DbOrTx } from '@/db/client';
import { cartLines, findBuyableProduct, findCart, type CartKind, type CartOwner, type CartRow } from '@/db/queries/cart';
import type { CheckoutConfig } from '@/db/queries/checkout-config';
import { resolveCartDiscount, type AppliedDiscount } from './discount';
import { cartItems, carts } from '@/db/schema';

// Escrituras del carrito (feature 005, FR-001 a FR-005). Cada cambio toca carts.updated_at, que
// gobierna la purga de los carritos de invitado (D16).

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CartChange =
  /** Añadido o cambiado tal cual. */
  | { status: 'ok'; cartId: string; quantity: number }
  /** Acotado a las unidades disponibles o al máximo por línea. */
  | { status: 'adjusted'; cartId: string; quantity: number; reason: 'stock' | 'max' }
  | { status: 'removed' }
  /** Producto inexistente, no publicado o agotado. */
  | { status: 'unavailable' }
  | { status: 'invalid' };

/** Busca el carrito del dueño o lo crea (sin carreras: ON CONFLICT DO NOTHING y relectura). */
export async function getOrCreateCart(owner: CartOwner, kind: CartKind, db: DbOrTx = getDb()): Promise<CartRow> {
  const existing = await findCart(owner, kind, db);
  if (existing) return existing;
  await db
    .insert(carts)
    .values({
      kind,
      customerId: 'customerId' in owner ? owner.customerId : null,
      tokenHash: 'tokenHash' in owner ? owner.tokenHash : null,
    })
    .onConflictDoNothing();
  const created = await findCart(owner, kind, db);
  if (!created) throw new Error('cart_create_failed');
  return created;
}

export async function touchCart(cartId: string, db: DbOrTx = getDb()): Promise<void> {
  await db.update(carts).set({ updatedAt: sql`now()` }).where(eq(carts.id, cartId));
}

async function currentQuantity(cartId: string, productId: string, db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));
  return row?.quantity ?? 0;
}

/** Crea o cambia una línea; el precio visto pasa a ser el actual (el comprador lo tiene delante). */
async function upsertLine(cartId: string, productId: string, quantity: number, unitPriceCents: number, db: DbOrTx): Promise<void> {
  await db
    .insert(cartItems)
    .values({ cartId, productId, quantity, unitPriceCents })
    .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.productId], set: { quantity, unitPriceCents } });
}

export interface AddItemInput {
  owner: CartOwner;
  productId: string;
  /** Cantidad tal como llega del formulario (1 por defecto). */
  quantity: unknown;
  maxPerLine: number;
  kind?: CartKind;
  /** "Comprar ahora" (US8): sustituye el contenido del carrito en vez de sumar. */
  replace?: boolean;
}

/**
 * Añade un producto (suma a lo que ya hubiera). El carrito solo se crea si el producto se puede
 * comprar: un producto agotado o no publicado no crea carrito (ni cookie).
 */
export async function addItem(input: AddItemInput, db: DbOrTx = getDb()): Promise<CartChange> {
  if (!UUID_RE.test(input.productId)) return { status: 'invalid' };
  const raw = input.quantity === undefined || input.quantity === null || input.quantity === '' ? '1' : input.quantity;
  const product = await findBuyableProduct(input.productId, db);
  if (!product || product.stock <= 0) return { status: 'unavailable' };
  const wanted = clampQuantity(raw, { stock: Number.MAX_SAFE_INTEGER, maxPerLine: Number.MAX_SAFE_INTEGER });
  // Añadir 0, un negativo, un decimal o texto no es una cantidad válida.
  if (wanted.kind !== 'ok') return { status: 'invalid' };

  const kind = input.kind ?? 'main';
  const cart = await getOrCreateCart(input.owner, kind, db);
  if (input.replace) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
  const already = input.replace ? 0 : await currentQuantity(cart.id, product.id, db);
  const result = clampQuantity(already + wanted.quantity, { stock: product.stock, maxPerLine: input.maxPerLine });
  if (result.kind !== 'ok') return { status: 'unavailable' };
  await upsertLine(cart.id, product.id, result.quantity, product.priceCents, db);
  await touchCart(cart.id, db);
  return result.adjusted
    ? { status: 'adjusted', cartId: cart.id, quantity: result.quantity, reason: result.adjusted }
    : { status: 'ok', cartId: cart.id, quantity: result.quantity };
}

export interface SetQuantityInput {
  owner: CartOwner;
  productId: string;
  quantity: unknown;
  maxPerLine: number;
  kind?: CartKind;
}

/** Cambia la cantidad de una línea existente (0 = eliminar), acotada a stock y máximo. */
export async function setQuantity(input: SetQuantityInput, db: DbOrTx = getDb()): Promise<CartChange> {
  if (!UUID_RE.test(input.productId)) return { status: 'invalid' };
  const cart = await findCart(input.owner, input.kind ?? 'main', db);
  if (!cart) return { status: 'invalid' };
  const product = await findBuyableProduct(input.productId, db);
  const result = clampQuantity(input.quantity, { stock: product?.stock ?? 0, maxPerLine: input.maxPerLine });
  if (result.kind === 'invalid') return { status: 'invalid' };
  if (result.kind === 'remove' || result.kind === 'out_of_stock' || !product) {
    await removeItem({ owner: input.owner, productId: input.productId, kind: input.kind }, db);
    return result.kind === 'remove' ? { status: 'removed' } : { status: 'unavailable' };
  }
  if ((await currentQuantity(cart.id, product.id, db)) === 0) return { status: 'invalid' };
  await upsertLine(cart.id, product.id, result.quantity, product.priceCents, db);
  await touchCart(cart.id, db);
  return result.adjusted
    ? { status: 'adjusted', cartId: cart.id, quantity: result.quantity, reason: result.adjusted }
    : { status: 'ok', cartId: cart.id, quantity: result.quantity };
}

export async function removeItem(
  input: { owner: CartOwner; productId: string; kind?: CartKind },
  db: DbOrTx = getDb(),
): Promise<void> {
  if (!UUID_RE.test(input.productId)) return;
  const cart = await findCart(input.owner, input.kind ?? 'main', db);
  if (!cart) return;
  await db.delete(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, input.productId)));
  await touchCart(cart.id, db);
}

/** Vacía un carrito (tras pagar o confirmar el pedido con pago en clínica). */
export async function emptyCart(cartId: string, db: DbOrTx = getDb()): Promise<void> {
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
  await db.update(carts).set({ discountCodeId: null, updatedAt: sql`now()` }).where(eq(carts.id, cartId));
}

// ---------- Lectura con revalidación (FR-006) ----------

export interface CartLineView {
  productId: string;
  slug: string;
  name: string;
  categoryName: string;
  pets: string[];
  imagePath: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  unitPriceCents: number;
  vatRate: number;
  quantity: number;
  /** Máximo que se puede pedir ahora: min(stock, máximo por línea). */
  maxQuantity: number;
  /** Importe de la línea (unitario × cantidad); 0 si no está disponible. */
  lineTotalCents: number;
  unavailable: boolean;
  /** Avisos de la línea en español: precio cambiado, cantidad ajustada o no disponible. */
  notices: string[];
}

export interface CartView {
  cart: CartRow;
  lines: CartLineView[];
  totals: CartTotals;
  /** Envío que se muestra antes de elegir: el más barato de los activos. */
  shipping: { name: string; costCents: number } | null;
  discount: AppliedDiscount | null;
  /** Avisos del carrito (no de una línea), p. ej. el código retirado. */
  notices: string[];
  /** Hay líneas que se pueden comprar. */
  canCheckout: boolean;
}

/**
 * Lee el carrito con los datos actuales del catálogo: precio, publicación y stock. Ajusta en la
 * base las cantidades que superan lo disponible, actualiza el precio visto (el aviso se muestra
 * una vez) y calcula los totales con cartTotals() (D5).
 */
export async function readCart(
  cart: CartRow,
  config: Pick<CheckoutConfig, 'settings' | 'shippingMethods'>,
  now: Date,
  db: DbOrTx = getDb(),
): Promise<CartView> {
  const rows = await cartLines(cart.id, db);
  const maxPerLine = config.settings.maxQtyPerLine;
  const lines: CartLineView[] = [];
  for (const row of rows) {
    const notices: string[] = [];
    const unavailable = !row.visible || row.stock <= 0;
    let quantity = row.quantity;
    const maxQuantity = unavailable ? 0 : Math.min(row.stock, maxPerLine);
    if (unavailable) {
      notices.push('Este producto ya no está disponible');
    } else {
      if (row.seenPriceCents !== row.priceCents) {
        notices.push(`El precio ha cambiado: antes ${formatEur(row.seenPriceCents)}, ahora ${formatEur(row.priceCents)}`);
      }
      if (quantity > maxQuantity) {
        quantity = maxQuantity;
        notices.push(
          row.stock <= maxPerLine
            ? row.stock === 1
              ? 'Solo queda 1 unidad'
              : `Solo quedan ${row.stock} unidades`
            : `Como máximo ${maxPerLine} unidades por producto`,
        );
      }
      if (quantity !== row.quantity || row.seenPriceCents !== row.priceCents) {
        await db
          .update(cartItems)
          .set({ quantity, unitPriceCents: row.priceCents })
          .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, row.productId)));
      }
    }
    lines.push({
      productId: row.productId,
      slug: row.slug,
      name: row.name,
      categoryName: row.categoryName,
      pets: row.pets,
      imagePath: row.imagePath,
      imageAlt: row.imageAlt,
      imageWidth: row.imageWidth,
      imageHeight: row.imageHeight,
      unitPriceCents: row.priceCents,
      vatRate: row.vatRate,
      quantity,
      maxQuantity,
      lineTotalCents: unavailable ? 0 : row.priceCents * quantity,
      unavailable,
      notices,
    });
  }

  const priceLines = lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity, vatRate: l.vatRate, unavailable: l.unavailable }));
  const subtotal = cartTotals(priceLines, null, { costCents: 0, vatRate: 0 }).subtotalCents;
  const notices: string[] = [];
  let discount: AppliedDiscount | null = null;
  if (cart.discountCodeId) {
    const resolved = await resolveCartDiscount(cart.discountCodeId, subtotal, now, db);
    if (resolved.ok) {
      discount = resolved.discount;
    } else {
      notices.push(resolved.message);
      await db.update(carts).set({ discountCodeId: null }).where(eq(carts.id, cart.id));
    }
  }
  const cheapest = config.shippingMethods.reduce<(typeof config.shippingMethods)[number] | null>(
    (best, m) => (best === null || m.costCents < best.costCents ? m : best),
    null,
  );
  const totals = cartTotals(priceLines, discount?.rule ?? null, cheapest ?? { costCents: 0, vatRate: 0 });
  return {
    cart: { ...cart, discountCodeId: discount ? cart.discountCodeId : null },
    lines,
    totals,
    shipping: cheapest ? { name: cheapest.name, costCents: cheapest.costCents } : null,
    discount,
    notices,
    canCheckout: lines.some((l) => !l.unavailable),
  };
}
