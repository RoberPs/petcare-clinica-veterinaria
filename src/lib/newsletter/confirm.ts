import { and, eq, gt } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { newsletterSubscriptions } from '@/db/schema';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { linkCustomerOnConfirm } from './sync';
import { confirmTokenHash } from './tokens';

// Confirmación del alta (E8). El GET solo comprueba el token (los escáneres de enlaces no deben
// confirmar); el POST confirma de forma atómica. El hash se conserva tras confirmar, así que un
// segundo uso responde "ya confirmada". Caducado, sustituido o manipulado son un mismo estado.

export type ConfirmState = 'valid' | 'already' | 'invalid';
export type ConfirmResult = 'ok' | 'already' | 'invalid' | 'error';

export async function peekConfirmation(token: unknown, now: Date = new Date()): Promise<ConfirmState> {
  const hash = confirmTokenHash(token);
  if (!hash) return 'invalid';
  const [row] = await getDb()
    .select({ status: newsletterSubscriptions.status, expiresAt: newsletterSubscriptions.confirmExpiresAt })
    .from(newsletterSubscriptions)
    .where(eq(newsletterSubscriptions.confirmTokenHash, hash))
    .limit(1);
  if (!row) return 'invalid';
  if (row.status === 'confirmed') return 'already';
  return row.expiresAt && row.expiresAt > now ? 'valid' : 'invalid';
}

export async function confirmSubscription(token: unknown, now: Date = new Date()): Promise<ConfirmResult> {
  const hash = confirmTokenHash(token);
  if (!hash) return 'invalid';
  try {
    return await getDb().transaction(async (tx) => {
      const [sub] = await tx
        .update(newsletterSubscriptions)
        .set({ status: 'confirmed', confirmedAt: now })
        .where(
          and(
            eq(newsletterSubscriptions.confirmTokenHash, hash),
            gt(newsletterSubscriptions.confirmExpiresAt, now),
            eq(newsletterSubscriptions.status, 'pending'),
          ),
        )
        .returning();
      if (sub) {
        await linkCustomerOnConfirm(tx, sub, now);
        logger.info({ subscription_id: sub.id, code: 'form' }, 'newsletter_confirmed');
        return 'ok';
      }
      const [row] = await tx
        .select({ status: newsletterSubscriptions.status })
        .from(newsletterSubscriptions)
        .where(eq(newsletterSubscriptions.confirmTokenHash, hash))
        .limit(1);
      return row?.status === 'confirmed' ? 'already' : 'invalid';
    });
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'newsletter_confirm_failed');
    return 'error';
  }
}
