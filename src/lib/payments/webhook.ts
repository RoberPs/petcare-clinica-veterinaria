import { and, eq, sql } from 'drizzle-orm';
import { getDb, type DbOrTx } from '@/db/client';
import { lockOrder, type OrderRow, type PaymentRow } from '@/db/queries/orders';
import { orderStatusHistory, orders, paymentEvents, payments } from '@/db/schema';
import { sendEmailsSoon } from '@/email/outbox';
import { emptyCart } from '@/lib/cart/cart';
import { StockUnavailableError } from '@/lib/checkout/reserve';
import { logger } from '@/lib/logger';
import { refundOrder } from '@/lib/orders/refund';
import { transitionOrder } from '@/lib/orders/transition';
import { getPaymentProvider, InvalidSignature, type CheckoutSession, type PaymentEvent } from './provider';

// Aviso firmado de la pasarela y conciliación (D7, D8, contracts/payments.md). Un solo camino
// idempotente para el aviso, la vuelta del navegador y la tarea de mantenimiento: el pedido se
// bloquea con SELECT … FOR UPDATE y el pago "succeeded" es único por pedido (SC-003).

export type EventResult = 'ok' | 'ignored' | 'duplicate';

interface Effects {
  emailIds: string[];
  /** Pedidos a reembolsar después de la transacción (con o sin correo de cancelación). */
  refunds: { orderId: string; sendCancelledEmail: boolean }[];
}

const noEffects = (): Effects => ({ emailIds: [], refunds: [] });

async function lockPaymentBySession(tx: DbOrTx, sessionId: string): Promise<PaymentRow | null> {
  const [row] = await tx.select().from(payments).where(eq(payments.providerSessionId, sessionId)).for('update').limit(1);
  return row ?? null;
}

async function markPaymentSucceeded(tx: DbOrTx, payment: PaymentRow, paymentId: string | null, now: Date): Promise<void> {
  await tx
    .update(payments)
    .set({ status: 'succeeded', providerPaymentId: paymentId ?? payment.providerPaymentId, updatedAt: now })
    .where(eq(payments.id, payment.id));
}

export interface PaidInput {
  sessionId: string;
  paymentId: string | null;
  amountCents: number;
}

/**
 * Pago confirmado (aviso, vuelta del navegador o conciliación). Idempotente: un segundo intento
 * encuentra el pago ya "succeeded" y no cambia nada (un solo cambio de estado y un solo correo).
 */
export async function markOrderPaid(tx: DbOrTx, input: PaidInput, now: Date): Promise<{ outcome: string; effects: Effects }> {
  const effects = noEffects();
  const payment = await lockPaymentBySession(tx, input.sessionId);
  // Aviso antes de que exista la fila del pago (carrera con la creación de la sesión): 500 y reintento.
  if (!payment) throw new Error('payment_not_found');
  const order = (await lockOrder(payment.orderId, tx)) as OrderRow;
  if (payment.status === 'succeeded' || payment.status === 'refunded') return { outcome: 'already', effects };

  await markPaymentSucceeded(tx, payment, input.paymentId, now);
  if (input.amountCents !== order.totalCents) {
    // El importe cobrado no es el del pedido: se registra y se devuelve; el pedido no se da por pagado.
    logger.error({ event: 'payment_amount_mismatch', order_id: order.id, payment_id: payment.id });
    await tx.update(orders).set({ refundStatus: 'pending', updatedAt: now }).where(eq(orders.id, order.id));
    effects.refunds.push({ orderId: order.id, sendCancelledEmail: false });
    return { outcome: 'amount_mismatch', effects };
  }

  if (order.status === 'pending_payment') {
    const result = await transitionOrder(tx, order.id, 'paid', 'gateway', { now });
    if (order.cartId) await emptyCart(order.cartId, tx);
    effects.emailIds.push(...result.emailIds);
    logger.info({ event: 'order_paid', order_id: order.id, payment_id: payment.id });
    return { outcome: 'paid', effects };
  }

  if (order.status === 'cancelled' && order.cancelReason === 'expired') {
    // Pago tardío (D8): si queda stock, se vuelve a reservar y el pedido pasa a "Pagado".
    try {
      const result = await transitionOrder(tx, order.id, 'paid', 'gateway', { now, note: 'pago tardío' });
      if (order.cartId) await emptyCart(order.cartId, tx);
      effects.emailIds.push(...result.emailIds);
      logger.info({ event: 'order_paid_late', order_id: order.id, payment_id: payment.id });
      return { outcome: 'late_paid', effects };
    } catch (error) {
      if (!(error instanceof StockUnavailableError)) throw error;
    }
    // Sin stock: sigue cancelado, ahora por falta de stock, y se reembolsa con su correo.
    await tx
      .update(orders)
      .set({ cancelReason: 'stock_unavailable', refundStatus: 'pending', lastStatusAt: now, updatedAt: now })
      .where(eq(orders.id, order.id));
    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: 'cancelled',
      toStatus: 'cancelled',
      actor: 'gateway',
      note: 'pago tardío sin stock: reembolso',
      createdAt: now,
    });
    effects.refunds.push({ orderId: order.id, sendCancelledEmail: true });
    logger.warn({ event: 'late_payment_no_stock', order_id: order.id, payment_id: payment.id });
    return { outcome: 'late_no_stock', effects };
  }

  if (order.status === 'cancelled') {
    // Pagado después de cancelarlo por otro motivo: se devuelve el dinero y se avisa.
    await tx.update(orders).set({ refundStatus: 'pending', updatedAt: now }).where(eq(orders.id, order.id));
    effects.refunds.push({ orderId: order.id, sendCancelledEmail: true });
    logger.warn({ event: 'payment_on_cancelled_order', order_id: order.id, payment_id: payment.id });
    return { outcome: 'cancelled_refund', effects };
  }
  return { outcome: 'already', effects };
}

/** Sesión caducada en la pasarela: si el pedido sigue pendiente, se cancela (expired). */
export async function markSessionExpired(tx: DbOrTx, sessionId: string, now: Date): Promise<{ outcome: string; effects: Effects }> {
  const effects = noEffects();
  const payment = await lockPaymentBySession(tx, sessionId);
  if (!payment) return { outcome: 'unknown', effects };
  const order = await lockOrder(payment.orderId, tx);
  if (payment.status === 'open') {
    await tx.update(payments).set({ status: 'expired', updatedAt: now }).where(eq(payments.id, payment.id));
  }
  if (order?.status === 'pending_payment' && order.paymentMethod === 'card') {
    const result = await transitionOrder(tx, order.id, 'cancelled', 'system', { now, reason: 'expired', note: 'sesión de pago caducada' });
    effects.emailIds.push(...result.emailIds);
    return { outcome: 'expired', effects };
  }
  return { outcome: 'noop', effects };
}

async function markRefunded(tx: DbOrTx, paymentId: string, refundId: string, now: Date): Promise<string> {
  const [payment] = await tx.select().from(payments).where(eq(payments.providerPaymentId, paymentId)).for('update').limit(1);
  if (!payment) return 'unknown';
  await tx
    .update(payments)
    .set({ status: 'refunded', refundId: payment.refundId ?? refundId, updatedAt: now })
    .where(eq(payments.id, payment.id));
  // Sin segundo correo: el de cancelación ya dijo que se estaba tramitando (contracts/emails.md).
  await tx
    .update(orders)
    .set({ refundStatus: 'refunded', refundedAt: now, refundNextAttemptAt: null, updatedAt: now })
    .where(and(eq(orders.id, payment.orderId), sql`${orders.refundStatus} <> 'refunded'`));
  return 'refunded';
}

async function runEffects(effects: Effects, now: Date): Promise<void> {
  sendEmailsSoon(effects.emailIds);
  for (const r of effects.refunds) {
    try {
      await refundOrder(r.orderId, { now, sendCancelledEmail: r.sendCancelledEmail });
    } catch (error) {
      // Queda "pending": lo reintenta orders:maintain.
      logger.error({ event: 'refund_after_payment_failed', order_id: r.orderId, code: error instanceof Error ? error.message.slice(0, 80) : 'unknown' });
    }
  }
}

/**
 * Procesa un evento ya verificado. Registra su id en payment_events en la MISMA transacción: si el
 * proceso falla, no queda registrado y la pasarela lo reintenta; si ya estaba, no hace nada.
 */
export async function handlePaymentEvent(event: PaymentEvent, providerName: string, now: Date): Promise<EventResult> {
  const { result, effects } = await getDb().transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentEvents)
      .values({ providerEventId: event.id, provider: providerName, type: event.type === 'ignored' ? event.rawType : event.type, receivedAt: now })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.providerEventId });
    if (inserted.length === 0) return { result: 'duplicate' as EventResult, effects: noEffects() };

    let result: EventResult = 'ok';
    let effects = noEffects();
    if (event.type === 'checkout.completed') {
      if (event.paid) ({ effects } = await markOrderPaid(tx, { sessionId: event.sessionId, paymentId: event.paymentId, amountCents: event.amountCents }, now));
      else result = 'ignored';
    } else if (event.type === 'checkout.expired') {
      ({ effects } = await markSessionExpired(tx, event.sessionId, now));
    } else if (event.type === 'refund.succeeded') {
      await markRefunded(tx, event.paymentId, event.refundId, now);
    } else {
      result = 'ignored';
    }
    await tx.update(paymentEvents).set({ processedAt: now, result }).where(eq(paymentEvents.providerEventId, event.id));
    return { result, effects };
  });
  await runEffects(effects, now);
  return result;
}

/** POST /api/pagos/webhook: 400 si la firma no vale, 500 ante un error transitorio, 200 si no. */
export async function handleWebhookRequest(rawBody: string, headers: Headers, now: Date): Promise<{ status: 200 | 400 | 500 }> {
  const provider = await getPaymentProvider();
  let event: PaymentEvent;
  try {
    event = provider.verifyWebhook(rawBody, headers, now);
  } catch (error) {
    logger.warn({ event: error instanceof InvalidSignature ? 'payment_webhook_invalid_signature' : 'payment_webhook_bad_event' });
    return { status: 400 };
  }
  try {
    const result = await handlePaymentEvent(event, provider.name, now);
    logger.info({ event: 'payment_webhook', type: event.type, result });
    return { status: 200 };
  } catch (error) {
    logger.error({ event: 'payment_webhook_error', type: event.type, code: error instanceof Error ? error.message.slice(0, 80) : 'unknown' });
    return { status: 500 };
  }
}

/**
 * Conciliación con la pasarela (vuelta a /pedido/confirmado y orders:maintain): consulta la sesión
 * con la clave secreta y aplica el mismo camino que el aviso.
 */
export async function reconcilePayment(payment: Pick<PaymentRow, 'providerSessionId'>, now: Date): Promise<CheckoutSession['status'] | 'error'> {
  let session: CheckoutSession;
  try {
    session = await (await getPaymentProvider()).retrieveCheckout(payment.providerSessionId);
  } catch (error) {
    logger.warn({ event: 'payment_reconcile_failed', code: error instanceof Error ? error.message.slice(0, 80) : 'unknown' });
    return 'error';
  }
  if (session.status === 'complete' && session.paid) {
    const { effects } = await getDb().transaction((tx) =>
      markOrderPaid(tx, { sessionId: payment.providerSessionId, paymentId: session.paymentId, amountCents: session.amountCents }, now),
    );
    await runEffects(effects, now);
  } else if (session.status === 'expired') {
    const { effects } = await getDb().transaction((tx) => markSessionExpired(tx, payment.providerSessionId, now));
    await runEffects(effects, now);
  }
  return session.status;
}
