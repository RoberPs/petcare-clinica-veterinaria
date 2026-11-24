import type { CancelReason, OrderActor, OrderStatus } from '@/domain/order-status';
import { getDb } from '@/db/client';
import { getOrder, succeededPayment } from '@/db/queries/orders';
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
  /** Feature 008 (G8): estado que vio el administrador; si ya no lo es, StaleOrderError. */
  expectedFrom?: OrderStatus;
  /** Feature 008 (G9): administrador del panel que cancela. */
  adminId?: string | null;
}

export interface CancelResult {
  /** Estado del reembolso si el pedido estaba pagado. */
  refund: RefundOutcome | null;
}

export async function cancelOrder(orderId: string, actor: OrderActor, options: CancelOptions): Promise<CancelResult> {
  const order = await getOrder(orderId);
  const wasPaid = order?.status === 'paid' || order?.status === 'preparing' || order?.status === 'ready_for_pickup';
  // Feature 008: un pago en la clínica no pasa por la pasarela; no hay nada que reembolsar por ella
  // (se devuelve en el mostrador) y la cancelación avisa como una normal.
  const viaGateway = wasPaid && (await succeededPayment(orderId)) !== null;
  if (!viaGateway) {
    const { emailIds } = await getDb().transaction((tx) =>
      transitionOrder(tx, orderId, 'cancelled', actor, {
        now: options.now,
        reason: options.reason,
        note: options.note,
        expectedFrom: options.expectedFrom,
        adminId: options.adminId,
      }),
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
      expectedFrom: options.expectedFrom,
      adminId: options.adminId,
    }),
  );
  logger.info({ event: 'order_cancelled', order_id: orderId, reason: options.reason ?? 'clinic', refund: true });
  const refund = await refundOrder(orderId, { now: options.now, sendCancelledEmail: true });
  return { refund };
}
