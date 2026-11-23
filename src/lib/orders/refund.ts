import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { getOrder, lockOrder, succeededPayment } from '@/db/queries/orders';
import { orders, payments } from '@/db/schema';
import { sendEmailsSoon } from '@/email/outbox';
import { logger } from '@/lib/logger';
import { getPaymentProvider, PaymentProviderError } from '@/lib/payments/provider';
import { enqueueOrderEmails } from './emails';

// Reembolsos (D9): la llamada a la pasarela va fuera de la transacción (con su clave de
// idempotencia refund-<pedido>) y después se apunta el resultado. Si falla, queda "pending" y
// orders:maintain lo reintenta con espera creciente; a los 8 intentos pasa a "failed" y se
// registra un error para la clínica.

export const MAX_REFUND_ATTEMPTS = 8;
const BACKOFF_MINUTES = [1, 5, 15, 30, 60, 120, 240, 480];

export type RefundOutcome = 'refunded' | 'pending' | 'failed' | 'not_needed';

export interface RefundOptions {
  now: Date;
  /** Encola el correo de cancelación con la frase del reembolso (solo en la primera llamada). */
  sendCancelledEmail?: boolean;
}

export async function refundOrder(orderId: string, options: RefundOptions): Promise<RefundOutcome> {
  const order = await getOrder(orderId);
  const payment = await succeededPayment(orderId);
  if (!order || !payment || !payment.providerPaymentId) return 'not_needed';
  if (order.refundStatus === 'refunded' || payment.status === 'refunded') {
    if (options.sendCancelledEmail) sendEmailsSoon(await getDb().transaction((tx) => enqueueOrderEmails(tx, orderId, ['order_cancelled'])));
    return 'refunded';
  }

  let refundId: string | null = null;
  let errorCode: string | null = null;
  try {
    const provider = await getPaymentProvider();
    ({ refundId } = await provider.refund({ paymentId: payment.providerPaymentId, orderId, amountCents: payment.amountCents }));
  } catch (error) {
    errorCode = error instanceof PaymentProviderError ? error.code : 'unknown';
  }

  const { outcome, emailIds } = await getDb().transaction(async (tx) => {
    const locked = await lockOrder(orderId, tx);
    if (!locked) return { outcome: 'not_needed' as const, emailIds: [] };
    let outcome: RefundOutcome;
    if (refundId) {
      await tx
        .update(orders)
        .set({ refundStatus: 'refunded', refundedAt: options.now, refundNextAttemptAt: null, updatedAt: options.now })
        .where(eq(orders.id, orderId));
      await tx
        .update(payments)
        .set({ status: 'refunded', refundId, updatedAt: options.now })
        .where(and(eq(payments.id, payment.id), eq(payments.status, 'succeeded')));
      outcome = 'refunded';
      logger.info({ event: 'refund_succeeded', order_id: orderId, payment_id: payment.id });
    } else {
      const attempts = Math.min(MAX_REFUND_ATTEMPTS, locked.refundAttempts + 1);
      const failed = attempts >= MAX_REFUND_ATTEMPTS;
      await tx
        .update(orders)
        .set({
          refundStatus: failed ? 'failed' : 'pending',
          refundAttempts: attempts,
          refundNextAttemptAt: failed ? null : new Date(options.now.getTime() + BACKOFF_MINUTES[attempts - 1]! * 60_000),
          updatedAt: options.now,
        })
        .where(eq(orders.id, orderId));
      outcome = failed ? 'failed' : 'pending';
      (failed ? logger.error : logger.warn).call(logger, {
        event: failed ? 'refund_failed' : 'refund_retry_scheduled',
        order_id: orderId,
        payment_id: payment.id,
        code: errorCode,
        attempts,
      });
    }
    const emailIds = options.sendCancelledEmail ? await enqueueOrderEmails(tx, orderId, ['order_cancelled']) : [];
    return { outcome, emailIds };
  });
  sendEmailsSoon(emailIds);
  return outcome;
}
