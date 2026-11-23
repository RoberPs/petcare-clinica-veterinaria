import { eq } from 'drizzle-orm';
import { discountMessage, validateDiscount, type DiscountCodeData } from '@/domain/discount';
import type { DiscountRule } from '@/domain/pricing';
import { getDb, type DbOrTx } from '@/db/client';
import { discountCodes } from '@/db/schema';

// Códigos de descuento con efectos (D12): lectura y validación contra el carrito.

export interface DiscountRow extends DiscountCodeData {
  id: string;
}

export interface AppliedDiscount {
  id: string;
  code: string;
  rule: DiscountRule;
}

const columns = {
  id: discountCodes.id,
  code: discountCodes.code,
  kind: discountCodes.kind,
  value: discountCodes.value,
  minSubtotalCents: discountCodes.minSubtotalCents,
  startsAt: discountCodes.startsAt,
  endsAt: discountCodes.endsAt,
  maxUses: discountCodes.maxUses,
  usesCount: discountCodes.usesCount,
  enabled: discountCodes.enabled,
};

export async function findDiscountByCode(code: string, db: DbOrTx = getDb()): Promise<DiscountRow | null> {
  const [row] = await db.select(columns).from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
  return row ?? null;
}

export async function findDiscountById(id: string, db: DbOrTx = getDb()): Promise<DiscountRow | null> {
  const [row] = await db.select(columns).from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
  return row ?? null;
}

export const toApplied = (row: DiscountRow): AppliedDiscount => ({
  id: row.id,
  code: row.code,
  rule: { kind: row.kind, value: row.value },
});

/** Valida el código guardado en el carrito con el subtotal actual (retirada automática, US9). */
export async function resolveCartDiscount(
  discountCodeId: string,
  subtotalCents: number,
  now: Date,
  db: DbOrTx = getDb(),
): Promise<{ ok: true; discount: AppliedDiscount } | { ok: false; message: string }> {
  const row = await findDiscountById(discountCodeId, db);
  const check = validateDiscount(row, subtotalCents, now);
  if (check.ok) return { ok: true, discount: toApplied(row!) };
  const which = row ? `el código ${row.code}` : 'el código de descuento';
  return { ok: false, message: `Hemos quitado ${which} porque ya no se puede aplicar. ${discountMessage(check.reason, row)}` };
}
