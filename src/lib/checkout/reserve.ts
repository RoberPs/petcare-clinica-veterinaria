import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';

// Reserva de stock (D4): se descuenta al confirmar el pedido con un UPDATE condicionado por línea,
// en orden de product_id para evitar interbloqueos. Si alguna línea no cabe, se revierte todo.

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
 */
export async function reserveStock(tx: DbOrTx, lines: readonly ReserveLine[]): Promise<void> {
  const sorted = [...lines].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
  const missing: string[] = [];
  await tx.transaction(async (sp) => {
    for (const line of sorted) {
      const result = await sp.execute(sql`update products set stock = stock - ${line.quantity}, updated_at = now()
        where id = ${line.productId} and published and stock >= ${line.quantity} returning id`);
      if (result.rows.length === 0) missing.push(line.productId);
    }
    if (missing.length > 0) throw new StockUnavailableError(missing);
  });
}

/** Devuelve al stock las unidades del pedido (los productos borrados se ignoran). */
export async function releaseOrderStock(tx: DbOrTx, orderId: string): Promise<void> {
  await tx.execute(sql`update products p set stock = p.stock + oi.quantity, updated_at = now()
    from order_items oi where oi.order_id = ${orderId} and oi.product_id = p.id`);
}

/** Vuelve a reservar las unidades de un pedido (pago tardío, D8). Lanza StockUnavailableError. */
export async function reserveOrderStock(tx: DbOrTx, orderId: string): Promise<void> {
  const result = await tx.execute<{ product_id: string; quantity: number }>(
    sql`select product_id, quantity from order_items where order_id = ${orderId} and product_id is not null`,
  );
  await reserveStock(
    tx,
    result.rows.map((r) => ({ productId: r.product_id, quantity: Number(r.quantity) })),
  );
}
