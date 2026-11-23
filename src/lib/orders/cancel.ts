import type { CancelReason, OrderActor } from '@/domain/order-status';
import { getDb } from '@/db/client';
import { getOrder } from '@/db/queries/orders';
import { sendEmailsSoon } from '@/email/outbox';
import { logger } from '@/lib/logger';
import { refundOrder, type RefundOutcome } from './refund';
import { transitionOrder } from './transition';

// Cancelación de pedidos (FR-020): pendiente (cliente, sistema o clínica) o pagado (solo la
// clínica, con reembolso obligatorio, D9/D15). Siempre por transitionOrder.

export interface CancelOptions {
  reason?: CancelReason;
  note?: string;
  now: Date;
}

export interface CancelResult {
  /** Estado del reembolso si el pedido estaba pagado. */
  refund: RefundOutcome | null;
}

export async function cancelOrder(orderId: string, actor: OrderActor, options: CancelOptions): Promise<CancelResult> {
  const order = await getOrder(orderId);
  const wasPaid = order?.status === 'paid' || order?.status === 'preparing' || order?.status === 'ready_for_pickup';
  if (!wasPaid) {
    const { emailIds } = await getDb().transaction((tx) =>
      transitionOrder(tx, orderId, 'cancelled', actor, { now: options.now, reason: options.reason, note: options.note }),
    );
    sendEmailsSoon(emailIds);
    logger.info({ event: 'order_cancelled', order_id: orderId, reason: options.reason ?? actor });
    return { refund: null };
  }
  // Pagado: primero se cancela (devuelve el stock) con el reembolso "pendiente", para que la tarea
  // de mantenimiento lo reintente aunque el proceso se corte; después se reembolsa y se avisa.
  await getDb().transaction((tx) =>
    transitionOrder(tx, orderId, 'cancelled', actor, {
      now: options.now,
      reason: options.reason ?? 'clinic',
      note: options.note,
      skipEmail: true,
      refundStatus: 'pending',
    }),
  );
  logger.info({ event: 'order_cancelled', order_id: orderId, reason: options.reason ?? 'clinic', refund: true });
  const refund = await refundOrder(orderId, { now: options.now, sendCancelledEmail: true });
  return { refund };
}
