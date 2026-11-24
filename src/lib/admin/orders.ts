import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { lockOrder } from '@/db/queries/orders';
import { orders } from '@/db/schema';
import type { OrderStatus } from '@/domain/order-status';
import { sendEmailsSoon } from '@/email/outbox';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { cancelOrder } from '@/lib/orders/cancel';
import { refundOrder, type RefundOutcome } from '@/lib/orders/refund';
import { OrderNotFoundError, StaleOrderError, transitionOrder, TransitionError } from '@/lib/orders/transition';
import { recordAdminAction } from './audit';
import type { AdminActor } from './common';

// Pedidos desde el panel (US3 y US5, G7 a G10). Todo cambio de estado pasa por transitionOrder
// (src/lib/orders/), con el estado que vio el administrador (`from`) y su id para el historial.
// Los logs solo llevan ids y códigos: nunca el correo ni la dirección (G17).

export type OrderActionFailure = { status: 'stale' } | { status: 'not_allowed' } | { status: 'not_found' } | { status: 'error' };

function failureOf(error: unknown, admin: AdminActor, orderId: string, event: string): OrderActionFailure {
  if (error instanceof StaleOrderError) return { status: 'stale' };
  if (error instanceof TransitionError) return { status: 'not_allowed' };
  if (error instanceof OrderNotFoundError) return { status: 'not_found' };
  logger.error({ admin_id: admin.id, order_id: orderId, code: errorCode(error) }, event);
  return { status: 'error' };
}

/**
 * Avanza un pedido por su ciclo de vida (US3). La cancelación va por cancelOrderAdmin y el pago en
 * la clínica por confirmInClinicPayment: aquí no se aceptan.
 */
export async function setOrderStatusAdmin(
  admin: AdminActor,
  input: { id: string; from: OrderStatus; to: OrderStatus },
  now: Date,
): Promise<{ status: 'ok' } | OrderActionFailure> {
  if (input.to === 'cancelled' || input.from === 'pending_payment') return { status: 'not_allowed' };
  try {
    const emailIds = await getDb().transaction(async (tx) => {
      const r = await transitionOrder(tx, input.id, input.to, 'clinic', { now, expectedFrom: input.from, adminId: admin.id });
      await recordAdminAction(tx, {
        actorId: admin.id,
        action: 'order.status',
        entityType: 'order',
        entityId: input.id,
        changes: { from: r.from, to: r.to },
      });
      return r.emailIds;
    });
    sendEmailsSoon(emailIds);
    logger.info({ admin_id: admin.id, order_id: input.id, to: input.to }, 'admin_order_status');
    return { status: 'ok' };
  } catch (error) {
    return failureOf(error, admin, input.id, 'admin_order_status_failed');
  }
}

/**
 * Cancela un pedido (US3, escenario 4; G10): libera el stock y el uso del código y, si estaba
 * pagado, reembolsa. El motivo es interno: va al historial y nunca al correo del comprador.
 */
export async function cancelOrderAdmin(
  admin: AdminActor,
  input: { id: string; from: OrderStatus; note: string },
  now: Date,
): Promise<{ status: 'ok'; refund: RefundOutcome | null } | OrderActionFailure> {
  try {
    const { refund } = await cancelOrder(input.id, 'clinic', {
      reason: 'clinic',
      note: input.note,
      now,
      expectedFrom: input.from,
      adminId: admin.id,
    });
    await recordAdminAction(getDb(), {
      actorId: admin.id,
      action: 'order.cancel',
      entityType: 'order',
      entityId: input.id,
      changes: { from: input.from, to: 'cancelled' },
    });
    logger.info({ admin_id: admin.id, order_id: input.id, refund: refund ?? 'none' }, 'admin_order_cancelled');
    return { status: 'ok', refund };
  } catch (error) {
    return failureOf(error, admin, input.id, 'admin_order_cancel_failed');
  }
}

/**
 * Reintenta un reembolso que agotó sus 8 intentos (G10): reinicia el contador y vuelve a llamar a
 * la pasarela. Solo actúa con refund_status = 'failed'.
 */
export async function retryRefundAdmin(
  admin: AdminActor,
  id: string,
  now: Date,
): Promise<{ status: 'ok'; refund: RefundOutcome } | { status: 'not_failed' } | OrderActionFailure> {
  try {
    const reset = await getDb().transaction(async (tx) => {
      const order = await lockOrder(id, tx);
      if (!order) return 'not_found' as const;
      if (order.refundStatus !== 'failed') return 'not_failed' as const;
      await tx
        .update(orders)
        .set({ refundStatus: 'pending', refundAttempts: 0, refundNextAttemptAt: null, updatedAt: now })
        .where(and(eq(orders.id, id), eq(orders.refundStatus, 'failed')));
      await recordAdminAction(tx, { actorId: admin.id, action: 'order.refund_retry', entityType: 'order', entityId: id, changes: {} });
      return 'ok' as const;
    });
    if (reset !== 'ok') return { status: reset };
    const refund = await refundOrder(id, { now });
    logger.info({ admin_id: admin.id, order_id: id, refund }, 'admin_refund_retried');
    return { status: 'ok', refund };
  } catch (error) {
    return failureOf(error, admin, id, 'admin_refund_retry_failed');
  }
}

/**
 * Confirma el pago de un pedido de "Pago en clínica" (US5, G7): pasa a "Pagado" (la reserva queda
 * confirmada y ya no caduca) y, con `deliver`, también a "Entregado" en la misma transacción: dos
 * filas en el historial y un solo correo ("pago confirmado y pedido entregado").
 */
export async function confirmInClinicPayment(
  admin: AdminActor,
  input: { id: string; from: OrderStatus; deliver: boolean },
  now: Date,
): Promise<{ status: 'ok' } | OrderActionFailure> {
  try {
    const emailIds = await getDb().transaction(async (tx) => {
      const paid = await transitionOrder(tx, input.id, 'paid', 'clinic', {
        now,
        expectedFrom: input.from,
        adminId: admin.id,
        skipEmail: input.deliver,
      });
      const ids = [...paid.emailIds];
      if (input.deliver) {
        // Un milisegundo después: el historial se ordena por fecha.
        const delivered = await transitionOrder(tx, input.id, 'delivered', 'clinic', {
          now: new Date(now.getTime() + 1),
          adminId: admin.id,
          combinedEmail: true,
        });
        ids.push(...delivered.emailIds);
      }
      await recordAdminAction(tx, {
        actorId: admin.id,
        action: 'order.status',
        entityType: 'order',
        entityId: input.id,
        changes: { from: paid.from, to: input.deliver ? 'delivered' : 'paid', deliver: input.deliver },
      });
      return ids;
    });
    sendEmailsSoon(emailIds);
    logger.info({ admin_id: admin.id, order_id: input.id, deliver: input.deliver }, 'admin_in_clinic_paid');
    return { status: 'ok' };
  } catch (error) {
    return failureOf(error, admin, input.id, 'admin_in_clinic_failed');
  }
}
