import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../client';
import { orderItems, orderStatusHistory, orders, payments } from '../schema';

// Lecturas de pedidos (feature 005). Las consultas de un cliente filtran SIEMPRE por customer_id (IDOR, SC-006).

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

export async function getOrder(orderId: string, db: DbOrTx = getDb()): Promise<OrderRow | null> {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return row ?? null;
}

/** Bloquea el pedido hasta el final de la transacción (webhook, conciliación, CLI y tareas). */
export async function lockOrder(orderId: string, tx: DbOrTx): Promise<OrderRow | null> {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update').limit(1);
  return row ?? null;
}

export async function getOrderByNumber(number: string, db: DbOrTx = getDb()): Promise<OrderRow | null> {
  const [row] = await db.select().from(orders).where(eq(orders.number, number)).limit(1);
  return row ?? null;
}

export async function getOrderBySubmission(submissionId: string, db: DbOrTx = getDb()): Promise<OrderRow | null> {
  const [row] = await db.select().from(orders).where(eq(orders.submissionId, submissionId)).limit(1);
  return row ?? null;
}

export async function getOrderItems(orderId: string, db: DbOrTx = getDb()): Promise<OrderItemRow[]> {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.position));
}

export async function getOrderHistory(orderId: string, db: DbOrTx = getDb()) {
  return db
    .select({
      fromStatus: orderStatusHistory.fromStatus,
      toStatus: orderStatusHistory.toStatus,
      actor: orderStatusHistory.actor,
      createdAt: orderStatusHistory.createdAt,
    })
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id));
}

/** Último pago del pedido (el abierto o el cobrado). */
export async function latestPayment(orderId: string, db: DbOrTx = getDb()): Promise<PaymentRow | null> {
  const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(desc(payments.createdAt)).limit(1);
  return row ?? null;
}

export async function paymentBySession(sessionId: string, db: DbOrTx = getDb()): Promise<PaymentRow | null> {
  const [row] = await db.select().from(payments).where(eq(payments.providerSessionId, sessionId)).limit(1);
  return row ?? null;
}

export async function succeededPayment(orderId: string, db: DbOrTx = getDb()): Promise<PaymentRow | null> {
  const [row] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, orderId), sql`${payments.status} in ('succeeded', 'refunded')`))
    .orderBy(desc(payments.updatedAt))
    .limit(1);
  return row ?? null;
}

/** Pedidos pendientes de pago de un cliente o de un correo (límite de pendientes). */
export async function countPending(
  owner: { customerId: string } | { emailNormalized: string },
  db: DbOrTx = getDb(),
): Promise<number> {
  const where =
    'customerId' in owner
      ? and(eq(orders.customerId, owner.customerId), eq(orders.status, 'pending_payment'))
      : and(eq(orders.contactEmailNormalized, owner.emailNormalized), eq(orders.status, 'pending_payment'));
  const [row] = await db.select({ n: count() }).from(orders).where(where);
  return row?.n ?? 0;
}

/** Pedido con tarjeta pendiente del carrito (como mucho uno: índice único parcial, D10). */
export async function pendingCardOrderForCart(cartId: string, db: DbOrTx = getDb()): Promise<OrderRow | null> {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.cartId, cartId), eq(orders.status, 'pending_payment'), eq(orders.paymentMethod, 'card')))
    .limit(1);
  return row ?? null;
}

// ---------- Área del cliente (US5) ----------

export interface OrderListItem {
  id: string;
  number: string;
  createdAt: Date;
  status: OrderRow['status'];
  refundStatus: OrderRow['refundStatus'];
  totalCents: number;
  paymentMethod: OrderRow['paymentMethod'];
}

const listColumns = {
  id: orders.id,
  number: orders.number,
  createdAt: orders.createdAt,
  status: orders.status,
  refundStatus: orders.refundStatus,
  totalCents: orders.totalCents,
  paymentMethod: orders.paymentMethod,
};

export const ORDERS_PAGE_SIZE = 10;

export async function listCustomerOrders(
  customerId: string,
  page: number,
  db: DbOrTx = getDb(),
): Promise<{ items: OrderListItem[]; total: number }> {
  const [items, [total]] = await Promise.all([
    db
      .select(listColumns)
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt), desc(orders.number))
      .limit(ORDERS_PAGE_SIZE)
      .offset((Math.max(1, page) - 1) * ORDERS_PAGE_SIZE),
    db.select({ n: count() }).from(orders).where(eq(orders.customerId, customerId)),
  ]);
  return { items, total: total?.n ?? 0 };
}

export async function latestCustomerOrders(customerId: string, limit = 3, db: DbOrTx = getDb()): Promise<OrderListItem[]> {
  return db
    .select(listColumns)
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt), desc(orders.number))
    .limit(limit);
}

/** Pedido de un cliente por número; null si no existe o es de otro (404, SC-006). */
export async function getCustomerOrder(customerId: string, number: string, db: DbOrTx = getDb()): Promise<OrderRow | null> {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.number, number)))
    .limit(1);
  return row ?? null;
}

/** Último pedido del cliente (para precargar los datos del checkout, D19). */
export async function lastCustomerOrder(customerId: string, db: DbOrTx = getDb()): Promise<OrderRow | null> {
  const [row] = await db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt)).limit(1);
  return row ?? null;
}

/** Pedidos de un cliente con sus líneas, para la exportación v2 (solo customer_id, nunca invitado). */
export async function customerOrdersForExport(customerId: string, db: DbOrTx = getDb()) {
  const rows = await db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt));
  if (rows.length === 0) return [];
  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
    .orderBy(asc(orderItems.position));
  return rows.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
}
