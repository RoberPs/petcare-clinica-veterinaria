import { and, eq, gt, sql } from 'drizzle-orm';
import {
  canTransition,
  reservationEffect,
  statusLabel,
  type CancelReason,
  type OrderActor,
  type OrderStatus,
} from '@/domain/order-status';
import type { DbOrTx } from '@/db/client';
import { lockOrder, type OrderRow } from '@/db/queries/orders';
import { discountCodes, orderStatusHistory, orders } from '@/db/schema';
import type { OrderEmailKind } from '@/email/outbox';
import { isOrderStatusEmailState } from '@/email/templates/order-status';
import { releaseOrderStock, reserveOrderStock } from '@/lib/checkout/reserve';
import { enqueueOrderEmails, enqueueOrderStatusEmail } from './emails';

// Única puerta para cambiar el estado de un pedido: valida con la tabla de order-status.ts, escribe
// el historial y last_status_at, aplica el efecto en la reserva de stock y en el uso del código de
// descuento, y encola los correos. Nunca hay un UPDATE orders SET status fuera de aquí.

export class TransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Transición no permitida: ${statusLabel(from)} → ${statusLabel(to)}`);
    this.name = 'TransitionError';
  }
}

/** El pedido ya no está en el estado que vio quien pide el cambio (G8): no se hace nada. */
export class StaleOrderError extends Error {
  constructor(
    public readonly expected: OrderStatus,
    public readonly actual: OrderStatus,
  ) {
    super('stale_order');
    this.name = 'StaleOrderError';
  }
}

export class OrderNotFoundError extends Error {
  constructor() {
    super('order_not_found');
    this.name = 'OrderNotFoundError';
  }
}

export interface TransitionOptions {
  now: Date;
  reason?: CancelReason;
  /** Motivo técnico para el historial, sin datos personales (máximo 200 caracteres). */
  note?: string;
  /** No encolar correos (sustitución de un pedido, o el correo lo manda otro paso, p. ej. el reembolso). */
  skipEmail?: boolean;
  /** Estado del reembolso que se fija a la vez (cancelación de un pedido pagado). */
  refundStatus?: OrderRow['refundStatus'];
  /** Feature 008 (G9): administrador del panel que hace el cambio (order_status_history.admin_id). */
  adminId?: string | null;
  /** Feature 008 (G8): estado que vio el administrador; si ya no lo es, StaleOrderError. */
  expectedFrom?: OrderStatus;
  /** Feature 008 (US5): el correo order_status dice "pago confirmado y pedido entregado". */
  combinedEmail?: boolean;
}

export interface TransitionResult {
  order: OrderRow;
  from: OrderStatus;
  to: OrderStatus;
  emailIds: string[];
}

const DEFAULT_REASON: Record<OrderActor, CancelReason> = {
  customer: 'customer',
  clinic: 'clinic',
  system: 'expired',
  gateway: 'expired',
};

/** El uso del código está apartado mientras la reserva no esté liberada (D12). */
async function returnDiscountUse(tx: DbOrTx, order: OrderRow): Promise<void> {
  if (!order.discountCodeId) return;
  await tx
    .update(discountCodes)
    .set({ usesCount: sql`${discountCodes.usesCount} - 1` })
    .where(and(eq(discountCodes.id, order.discountCodeId), gt(discountCodes.usesCount, 0)));
}

async function retakeDiscountUse(tx: DbOrTx, order: OrderRow): Promise<void> {
  if (!order.discountCodeId) return;
  // Pago tardío: el comprador ya pagó con el descuento; si el código está agotado, no se supera el máximo.
  await tx
    .update(discountCodes)
    .set({ usesCount: sql`${discountCodes.usesCount} + 1` })
    .where(
      and(
        eq(discountCodes.id, order.discountCodeId),
        sql`(${discountCodes.maxUses} is null or ${discountCodes.usesCount} < ${discountCodes.maxUses})`,
      ),
    );
}

export async function transitionOrder(
  tx: DbOrTx,
  orderId: string,
  to: OrderStatus,
  actor: OrderActor,
  options: TransitionOptions,
): Promise<TransitionResult> {
  const order = await lockOrder(orderId, tx);
  if (!order) throw new OrderNotFoundError();
  const from = order.status;
  if (options.expectedFrom && options.expectedFrom !== from) throw new StaleOrderError(options.expectedFrom, from);
  if (!canTransition(order, to, actor, options.now)) throw new TransitionError(from, to);

  // Reserva de stock (D4): el UPDATE condicionado por el estado actual la hace idempotente.
  const nextReservation = reservationEffect(order.reservationStatus, to);
  if (nextReservation === 'released') {
    const released = await tx
      .update(orders)
      .set({ reservationStatus: 'released' })
      .where(and(eq(orders.id, orderId), sql`${orders.reservationStatus} in ('held', 'committed')`))
      .returning({ id: orders.id });
    if (released.length > 0) {
      await releaseOrderStock(tx, orderId);
      await returnDiscountUse(tx, order);
    }
  } else if (nextReservation === 'committed' && order.reservationStatus === 'released') {
    // Pago tardío (D8): vuelve a reservar; lanza StockUnavailableError si no alcanza.
    await reserveOrderStock(tx, orderId);
    await retakeDiscountUse(tx, order);
    await tx.update(orders).set({ reservationStatus: 'committed' }).where(eq(orders.id, orderId));
  } else if (nextReservation === 'committed') {
    await tx
      .update(orders)
      .set({ reservationStatus: 'committed' })
      .where(and(eq(orders.id, orderId), eq(orders.reservationStatus, 'held')));
  }

  const paidNow = (to === 'paid' || (to === 'delivered' && order.paymentMethod === 'in_clinic' && from === 'pending_payment')) && !order.paidAt;
  const [updated] = await tx
    .update(orders)
    .set({
      status: to,
      lastStatusAt: options.now,
      updatedAt: options.now,
      ...(paidNow ? { paidAt: options.now } : {}),
      ...(to === 'cancelled'
        ? { cancelledAt: options.now, cancelledBy: actor, cancelReason: options.reason ?? DEFAULT_REASON[actor] }
        : from === 'cancelled'
          ? { cancelledAt: null, cancelledBy: null, cancelReason: null }
          : {}),
      ...(options.refundStatus ? { refundStatus: options.refundStatus } : {}),
    })
    .where(eq(orders.id, orderId))
    .returning();

  await tx.insert(orderStatusHistory).values({
    orderId,
    fromStatus: from,
    toStatus: to,
    actor,
    adminId: actor === 'clinic' ? (options.adminId ?? null) : null,
    note: options.note?.slice(0, 200) ?? (options.reason ? `motivo: ${options.reason}` : null),
    createdAt: options.now,
  });

  const kinds: OrderEmailKind[] = [];
  if (!options.skipEmail) {
    // El pago con tarjeta lo confirma la pasarela; el pago en la clínica lo registra la clínica (order_status).
    if (to === 'paid' && actor !== 'clinic') kinds.push('order_confirmed', 'clinic_order');
    if (to === 'cancelled' && options.reason !== 'replaced') kinds.push('order_cancelled');
  }
  const emailIds = await enqueueOrderEmails(tx, orderId, kinds);
  // Feature 008 (G11): aviso al comprador de cada cambio de la clínica, desde el panel o la CLI.
  if (!options.skipEmail && actor === 'clinic' && isOrderStatusEmailState(to)) {
    // Entregar directamente un pedido de pago en clínica pendiente también confirma el pago.
    const combined = options.combinedEmail ?? (from === 'pending_payment' && to === 'delivered');
    const id = await enqueueOrderStatusEmail(tx, orderId, to, { combined });
    if (id) emailIds.push(id);
  }
  return { order: updated!, from, to, emailIds };
}
