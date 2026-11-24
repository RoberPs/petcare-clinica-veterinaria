import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { discountCodes } from '@/db/schema';
import type { DiscountInput } from '@/domain/store-schemas';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { recordAdminAction } from './audit';
import { isUniqueViolation, type AdminActor } from './common';

// Códigos de descuento desde el panel (US6, G12). No se editan (aclaración Q2): solo se crean y se
// activan o desactivan. El carrito retira con aviso un código que ya no se aplica, y los pedidos
// confirmados conservan su descuento porque lo copian.

export type CreateDiscountResult =
  | { status: 'ok'; id: string; created: boolean }
  | { status: 'invalid'; fieldErrors: Record<string, string> }
  | { status: 'error' };

const DUPLICATE = { code: 'Ya existe un código con ese nombre.' };

export async function createDiscountCode(
  admin: AdminActor,
  input: DiscountInput,
  options: { now: Date; submissionId?: string },
): Promise<CreateDiscountResult> {
  try {
    return await getDb().transaction(async (tx): Promise<CreateDiscountResult> => {
      // Alta idempotente: el id es el submission_id del token firmado.
      const id = options.submissionId ?? crypto.randomUUID();
      const [existing] = await tx.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
      if (existing) return { status: 'ok', id, created: false };
      await tx.insert(discountCodes).values({ id, ...input, enabled: true, createdAt: options.now, updatedAt: options.now });
      await recordAdminAction(tx, {
        actorId: admin.id,
        action: 'discount.create',
        entityType: 'discount_code',
        entityId: id,
        changes: {
          code: input.code,
          kind: input.kind,
          value: input.value,
          minSubtotalCents: input.minSubtotalCents,
          startsAt: input.startsAt?.toISOString() ?? null,
          endsAt: input.endsAt?.toISOString() ?? null,
          maxUses: input.maxUses,
        },
      });
      return { status: 'ok', id, created: true };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'invalid', fieldErrors: DUPLICATE };
    logger.error({ admin_id: admin.id, code: errorCode(error) }, 'admin_discount_failed');
    return { status: 'error' };
  }
}

export type SetDiscountEnabledResult = { status: 'ok'; changed: boolean } | { status: 'not_found' } | { status: 'error' };

export async function setDiscountEnabled(admin: AdminActor, id: string, enabled: boolean, now: Date): Promise<SetDiscountEnabledResult> {
  try {
    return await getDb().transaction(async (tx): Promise<SetDiscountEnabledResult> => {
      const [row] = await tx.select({ enabled: discountCodes.enabled }).from(discountCodes).where(eq(discountCodes.id, id)).for('update').limit(1);
      if (!row) return { status: 'not_found' };
      if (row.enabled === enabled) return { status: 'ok', changed: false };
      await tx.update(discountCodes).set({ enabled, updatedAt: now }).where(eq(discountCodes.id, id));
      await recordAdminAction(tx, {
        actorId: admin.id,
        action: enabled ? 'discount.enable' : 'discount.disable',
        entityType: 'discount_code',
        entityId: id,
        changes: { enabled: { before: row.enabled, after: enabled } },
      });
      return { status: 'ok', changed: true };
    });
  } catch (error) {
    logger.error({ admin_id: admin.id, code: errorCode(error) }, 'admin_discount_enable_failed');
    return { status: 'error' };
  }
}
