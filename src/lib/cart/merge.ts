import { eq } from 'drizzle-orm';
import { clampQuantity } from '@/domain/cart-rules';
import { getDb, type DbOrTx } from '@/db/client';
import { cartLines, findCart, lockCart } from '@/db/queries/cart';
import { getCheckoutSettings } from '@/db/queries/checkout-config';
import { cartItems, carts } from '@/db/schema';
import { getOrCreateCart, touchCart } from './cart';
import { hashCartToken } from './cookie';

// Unión de carritos al iniciar sesión (D3): suma las cantidades del carrito de invitado al de la
// cuenta, acotadas por stock y por el máximo por línea; conserva el código del cliente o, si no
// tiene, el del invitado; y borra los carritos de invitado (principal y directo). La cookie la
// borra la Server Action.

export interface MergeResult {
  merged: number;
  adjusted: number;
}

export async function mergeGuestCart(customerId: string, cookieToken: string, db: DbOrTx = getDb()): Promise<MergeResult> {
  const tokenHash = hashCartToken(cookieToken);
  const settings = await getCheckoutSettings();
  const maxPerLine = settings?.maxQtyPerLine ?? 10;
  const run = async (tx: DbOrTx): Promise<MergeResult> => {
    const guest = await lockCart({ tokenHash }, 'main', tx);
    if (!guest) {
      await tx.delete(carts).where(eq(carts.tokenHash, tokenHash));
      return { merged: 0, adjusted: 0 };
    }
    const lines = await cartLines(guest.id, tx);
    let merged = 0;
    let adjusted = 0;
    if (lines.length > 0 || guest.discountCodeId) {
      const target = await getOrCreateCart({ customerId }, 'main', tx);
      const existing = await tx
        .select({ productId: cartItems.productId, quantity: cartItems.quantity })
        .from(cartItems)
        .where(eq(cartItems.cartId, target.id));
      const current = new Map(existing.map((e) => [e.productId, e.quantity]));
      for (const line of lines) {
        if (!line.visible || line.stock <= 0) continue;
        const total = (current.get(line.productId) ?? 0) + line.quantity;
        const result = clampQuantity(total, { stock: line.stock, maxPerLine });
        if (result.kind !== 'ok') continue;
        if (result.adjusted) adjusted += 1;
        await tx
          .insert(cartItems)
          .values({
            cartId: target.id,
            productId: line.productId,
            quantity: result.quantity,
            unitPriceCents: line.seenPriceCents,
            addedAt: line.addedAt,
          })
          .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.productId], set: { quantity: result.quantity } });
        merged += 1;
      }
      if (!target.discountCodeId && guest.discountCodeId) {
        await tx.update(carts).set({ discountCodeId: guest.discountCodeId }).where(eq(carts.id, target.id));
      }
      await touchCart(target.id, tx);
    }
    await tx.delete(carts).where(eq(carts.tokenHash, tokenHash));
    return { merged, adjusted };
  };
  // Dentro de una transacción si nos la pasan; si no, abre la suya.
  return db === getDb() ? getDb().transaction(run) : run(db);
}

/** ¿Hay carrito de invitado para este token? (para no abrir una transacción sin motivo). */
export async function hasGuestCart(cookieToken: string): Promise<boolean> {
  return (await findCart({ tokenHash: hashCartToken(cookieToken) }, 'main')) !== null;
}
