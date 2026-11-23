import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { newsletterSubscriptions } from '@/db/schema';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { mirrorUnsubscribe, removeSubscription, type UnsubscribeReason } from './sync';
import { verifyUnsubscribeToken } from './tokens';

// Baja del boletín (E10): borra la fila viva y deja la constancia anónima en la misma transacción;
// si la suscripción estaba vinculada a una cuenta, desactiva su preferencia (E11). Idempotente.

export type UnsubscribeResult = 'ok' | 'already' | 'invalid' | 'error';

export async function unsubscribe(subscriptionId: string, reason: UnsubscribeReason, now: Date = new Date()): Promise<UnsubscribeResult> {
  try {
    return await getDb().transaction(async (tx) => {
      const [sub] = await tx.select().from(newsletterSubscriptions).where(eq(newsletterSubscriptions.id, subscriptionId)).for('update');
      if (!sub) return 'already';
      await removeSubscription(tx, sub, reason, now);
      if (sub.customerId) await mirrorUnsubscribe(tx, sub.customerId, now);
      return 'ok';
    });
  } catch (error) {
    logger.error({ subscription_id: subscriptionId, code: errorCode(error) }, 'newsletter_unsubscribe_failed');
    return 'error';
  }
}

/** Baja a partir del token del enlace: 'invalid' si la firma no vale. */
export async function unsubscribeWithToken(token: unknown, reason: UnsubscribeReason, now: Date = new Date()): Promise<UnsubscribeResult> {
  const id = verifyUnsubscribeToken(token);
  if (!id) return 'invalid';
  return unsubscribe(id, reason, now);
}

/** Estado del enlace sin dar de baja (GET de la página): 'valid', 'already' o 'invalid'. */
export async function peekUnsubscribe(token: unknown): Promise<'valid' | 'already' | 'invalid'> {
  const id = verifyUnsubscribeToken(token);
  if (!id) return 'invalid';
  const [row] = await getDb()
    .select({ id: newsletterSubscriptions.id })
    .from(newsletterSubscriptions)
    .where(eq(newsletterSubscriptions.id, id))
    .limit(1);
  return row ? 'valid' : 'already';
}
