import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import { getDb, getPool } from '@/db/client';
import { orders, payments } from '@/db/schema';
import { logger } from '@/lib/logger';
import { reconcilePayment } from '@/lib/payments/webhook';
import { cancelOrder } from './cancel';
import { refundOrder } from './refund';

// Tarea de mantenimiento de pedidos (D16, contracts/cli.md), cada minuto con petcare-orders-maintain:
// 1) concilia las sesiones abiertas de más de 5 minutos (rescata avisos perdidos);
// 2) caduca los pedidos vencidos (D8): con tarjeta, reservation_expires_at + 2 min; en clínica,
//    pickup_deadline;
// 3) reintenta los reembolsos pendientes.
// Cada paso va protegido con pg_try_advisory_lock para no solaparse con otra ejecución.

export const RECONCILE_AFTER_MS = 5 * 60_000;
/** Margen para pagos en curso antes de caducar un pedido con tarjeta (D8, SC-004). */
export const CARD_GRACE_MS = 2 * 60_000;
const BATCH = 100;

const LOCKS = { reconcile: 50_051, expire: 50_052, refunds: 50_053 } as const;

export interface MaintainSummary {
  reconciled: number;
  expired: number;
  refundsRetried: number;
}

/** Ejecuta `fn` solo si consigue el bloqueo consultivo; si otra ejecución lo tiene, devuelve 0. */
async function withLock(key: number, fn: () => Promise<number>): Promise<number> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [key]);
    if (!rows[0]?.ok) return 0;
    try {
      return await fn();
    } finally {
      await client.query('select pg_advisory_unlock($1)', [key]);
    }
  } finally {
    client.release();
  }
}

export async function reconcileOpenSessions(now: Date): Promise<number> {
  const open = await getDb()
    .select({ providerSessionId: payments.providerSessionId })
    .from(payments)
    .where(and(eq(payments.status, 'open'), lte(payments.createdAt, new Date(now.getTime() - RECONCILE_AFTER_MS))))
    .orderBy(asc(payments.createdAt))
    .limit(BATCH);
  let changed = 0;
  for (const p of open) {
    const status = await reconcilePayment(p, now);
    if (status === 'complete' || status === 'expired') changed += 1;
  }
  return changed;
}

export async function expireOrders(now: Date): Promise<number> {
  const due = await getDb()
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'pending_payment'),
        or(
          and(eq(orders.paymentMethod, 'card'), lte(orders.reservationExpiresAt, new Date(now.getTime() - CARD_GRACE_MS))),
          and(eq(orders.paymentMethod, 'in_clinic'), lte(orders.pickupDeadline, now)),
        ),
      ),
    )
    .orderBy(asc(orders.createdAt))
    .limit(BATCH);
  let expired = 0;
  for (const o of due) {
    try {
      await cancelOrder(o.id, 'system', { reason: 'expired', now, note: 'plazo vencido' });
      expired += 1;
    } catch (error) {
      // Otro proceso lo cambió a la vez (p. ej. un pago): la transición ya no vale.
      logger.warn({ event: 'order_expire_skipped', order_id: o.id, code: error instanceof Error ? error.message.slice(0, 80) : 'unknown' });
    }
  }
  return expired;
}

export async function retryRefunds(now: Date): Promise<number> {
  const due = await getDb()
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.refundStatus, 'pending'), or(isNull(orders.refundNextAttemptAt), lte(orders.refundNextAttemptAt, now))))
    .orderBy(asc(orders.updatedAt))
    .limit(BATCH);
  for (const o of due) await refundOrder(o.id, { now });
  return due.length;
}

export async function runOrdersMaintenance(now: Date): Promise<MaintainSummary> {
  const reconciled = await withLock(LOCKS.reconcile, () => reconcileOpenSessions(now));
  const expired = await withLock(LOCKS.expire, () => expireOrders(now));
  const refundsRetried = await withLock(LOCKS.refunds, () => retryRefunds(now));
  const summary = { reconciled, expired, refundsRetried };
  logger.info({ event: 'orders_maintain', expired, reconciled, refunds_retried: refundsRetried });
  return summary;
}

