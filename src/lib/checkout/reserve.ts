import { inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { stockMovements } from '@/db/schema';

// Reserva de stock (D4): se descuenta al confirmar el pedido con un UPDATE condicionado por línea,
// en orden de product_id para evitar interbloqueos. Si alguna línea no cabe, se revierte todo.
// Feature 008 (G5): cada cambio de stock deja un movimiento en la misma transacción.

export class StockUnavailableError extends Error {
  constructor(public readonly productIds: string[]) {
    super('stock_unavailable');
    this.name = 'StockUnavailableError';
  }
}

export interface ReserveLine {
  productId: string;
  quantity: number;
}

/**
 * Descuenta el stock de todas las líneas o de ninguna. Va dentro de un SAVEPOINT: si falla, la
 * transacción de quien llama sigue viva (el pago tardío necesita registrar que no había stock).
 * Escribe un movimiento `order_reserved` por línea; si el pedido aún no existe (checkout), se
 * enlaza después con `linkMovementsToOrder`. Devuelve los ids de los movimientos.
 */
export async function reserveStock(tx: DbOrTx, lines: readonly ReserveLine[], orderId: string | null = null): Promise<string[]> {
  const sorted = [...lines].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
  const missing: string[] = [];
  return tx.transaction(async (sp) => {
    const moved: { productId: string; delta: number; stockAfter: number }[] = [];
    for (const line of sorted) {
      const result = await sp.execute<{ id: string; stock: number }>(sql`update products set stock = stock - ${line.quantity}, updated_at = now()
        where id = ${line.productId} and published and stock >= ${line.quantity} returning id, stock`);
      const row = result.rows[0];
      if (!row) missing.push(line.productId);
      else moved.push({ productId: line.productId, delta: -line.quantity, stockAfter: Number(row.stock) });
    }
    if (missing.length > 0) throw new StockUnavailableError(missing);
    if (moved.length === 0) return [];
    const rows = await sp
      .insert(stockMovements)
      .values(moved.map((m) => ({ ...m, reason: 'order_reserved' as const, orderId })))
      .returning({ id: stockMovements.id });
    return rows.map((r) => r.id);
  });
}

/** Enlaza con el pedido los movimientos de una reserva hecha antes de crearlo (checkout). */
export async function linkMovementsToOrder(tx: DbOrTx, movementIds: readonly string[], orderId: string): Promise<void> {
  if (movementIds.length === 0) return;
  await tx.update(stockMovements).set({ orderId }).where(inArray(stockMovements.id, [...movementIds]));
}

/** Devuelve al stock las unidades del pedido (los productos borrados se ignoran), con su movimiento. */
export async function releaseOrderStock(tx: DbOrTx, orderId: string): Promise<void> {
  const result = await tx.execute<{ id: string; stock: number; quantity: number }>(sql`update products p
    set stock = p.stock + oi.quantity, updated_at = now()
    from order_items oi where oi.order_id = ${orderId} and oi.product_id = p.id
    returning p.id, p.stock, oi.quantity`);
  if (result.rows.length === 0) return;
  await tx.insert(stockMovements).values(
    result.rows.map((r) => ({
      productId: r.id,
      delta: Number(r.quantity),
      reason: 'order_released' as const,
      stockAfter: Number(r.stock),
      orderId,
    })),
  );
}

/** Vuelve a reservar las unidades de un pedido (pago tardío, D8). Lanza StockUnavailableError. */
export async function reserveOrderStock(tx: DbOrTx, orderId: string): Promise<void> {
  const result = await tx.execute<{ product_id: string; quantity: number }>(
    sql`select product_id, quantity from order_items where order_id = ${orderId} and product_id is not null`,
  );
  await reserveStock(
    tx,
    result.rows.map((r) => ({ productId: r.product_id, quantity: Number(r.quantity) })),
    orderId,
  );
}
