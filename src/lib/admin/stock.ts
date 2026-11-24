import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { products, stockMovements } from '@/db/schema';
import type { StockAdjustInput } from '@/domain/store-schemas';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { recordAdminAction } from './audit';
import type { AdminActor } from './common';

// Ajuste manual del stock disponible (US4, G5). El UPDATE condicionado es atómico frente a las
// reservas del checkout (otro UPDATE condicionado sobre la misma fila): el stock nunca baja de 0.
// El movimiento y el registro de la acción van en la misma transacción.

export type AdjustStockResult =
  | { status: 'ok'; stock: number; slug: string }
  | { status: 'insufficient'; max: number }
  | { status: 'not_found' }
  | { status: 'error' };

export async function adjustStock(admin: AdminActor, input: StockAdjustInput, now: Date): Promise<AdjustStockResult> {
  try {
    return await getDb().transaction(async (tx): Promise<AdjustStockResult> => {
      const [updated] = await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${input.delta}`, updatedAt: now })
        .where(sql`${products.id} = ${input.id} and ${products.stock} + ${input.delta} >= 0`)
        .returning({ stock: products.stock, slug: products.slug });
      if (!updated) {
        const [row] = await tx.select({ stock: products.stock }).from(products).where(eq(products.id, input.id)).limit(1);
        return row ? { status: 'insufficient', max: row.stock } : { status: 'not_found' };
      }
      await tx.insert(stockMovements).values({
        productId: input.id,
        delta: input.delta,
        reason: input.reason,
        stockAfter: updated.stock,
        adminId: admin.id,
        note: input.note,
        createdAt: now,
      });
      await recordAdminAction(tx, {
        actorId: admin.id,
        action: 'stock.adjust',
        entityType: 'product',
        entityId: input.id,
        changes: { delta: input.delta, reason: input.reason, stockAfter: updated.stock },
      });
      return { status: 'ok', stock: updated.stock, slug: updated.slug };
    });
  } catch (error) {
    logger.error({ admin_id: admin.id, product_id: input.id, code: errorCode(error) }, 'admin_stock_adjust_failed');
    return { status: 'error' };
  }
}
