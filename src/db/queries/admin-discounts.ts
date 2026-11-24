import { asc, desc } from 'drizzle-orm';
import { getDb } from '../client';
import { discountCodes } from '../schema';

// Códigos de descuento para el panel (US6): todos, también los desactivados, de más reciente a más
// antiguo. El estado se calcula con discountState (src/domain/discount.ts).

export type AdminDiscountRow = typeof discountCodes.$inferSelect;

export async function listDiscountCodesAdmin(): Promise<AdminDiscountRow[]> {
  return getDb().select().from(discountCodes).orderBy(desc(discountCodes.createdAt), asc(discountCodes.code));
}
