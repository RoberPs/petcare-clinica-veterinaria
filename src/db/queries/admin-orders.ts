import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import { ORDER_STATUSES, type OrderActor, type OrderStatus } from '@/domain/order-status';
import { escapeLike } from '@/domain/search';
import { getDb, type DbOrTx } from '../client';
import { customers, orderItems, orders, orderStatusHistory, payments } from '../schema';
import type { OrderItemRow, OrderRow, PaymentRow } from './orders';

// Lecturas de pedidos para el panel (US2, G6). Orden de más reciente a más antiguo, 25 por página.
// Los pedidos anonimizados se listan sin datos de contacto.

export const ADMIN_ORDERS_PAGE_SIZE = 25;

/** Número tal como se busca: sin espacios y en mayúsculas (" ped-0001 " → "PED-0001"). Se busca por prefijo. */
export function normalizeOrderNumber(text: string): string {
  return text.replace(/\s+/g, '').toUpperCase().slice(0, 20);
}

export interface AdminOrderFilter {
  status?: OrderStatus | null;
  number?: string;
  page?: number;
}

export interface AdminOrderRow {
  id: string;
  number: string;
  createdAt: Date;
  status: OrderStatus;
  refundStatus: OrderRow['refundStatus'];
  paymentMethod: OrderRow['paymentMethod'];
  shippingKind: OrderRow['shippingKind'];
  totalCents: number;
  /** Nombre del comprador, o null si el pedido está anonimizado. */
  customerName: string | null;
  units: number;
}

function conditions(filter: AdminOrderFilter): SQL | undefined {
  const parts: SQL[] = [];
  if (filter.status) parts.push(eq(orders.status, filter.status));
  const number = filter.number ? normalizeOrderNumber(filter.number) : '';
  if (number) parts.push(sql`${orders.number} like ${`${escapeLike(number)}%`} escape '\\'`);
  return parts.length ? and(...parts) : undefined;
}

export async function listOrdersAdmin(filter: AdminOrderFilter): Promise<{ rows: AdminOrderRow[]; total: number }> {
  const db = getDb();
  const where = conditions(filter);
  const page = Math.max(1, filter.page ?? 1);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        createdAt: orders.createdAt,
        status: orders.status,
        refundStatus: orders.refundStatus,
        paymentMethod: orders.paymentMethod,
        shippingKind: orders.shippingKind,
        totalCents: orders.totalCents,
        customerName: sql<string | null>`case when ${orders.anonymizedAt} is null then ${orders.firstName} || ' ' || ${orders.lastName} else null end`,
        units: sql<number>`coalesce((select sum(${orderItems.quantity}) from ${orderItems} where ${orderItems.orderId} = ${orders.id}), 0)::int`,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(ADMIN_ORDERS_PAGE_SIZE)
      .offset((page - 1) * ADMIN_ORDERS_PAGE_SIZE),
    db.select({ n: count() }).from(orders).where(where),
  ]);
  return { rows, total: totalRow?.n ?? 0 };
}

/** Recuento por estado (pestañas) y total. */
export async function countOrdersByStatus(): Promise<Record<OrderStatus, number> & { all: number }> {
  const rows = await getDb().select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status);
  const out = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  let all = 0;
  for (const r of rows) {
    out[r.status] = r.n;
    all += r.n;
  }
  return { ...out, all };
}

export interface AdminOrderHistoryEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actor: OrderActor;
  note: string | null;
  createdAt: Date;
  /** Nombre del administrador del panel; null desde la CLI o si no es la clínica. */
  adminName: string | null;
}

export interface AdminOrderDetail {
  order: OrderRow;
  items: OrderItemRow[];
  history: AdminOrderHistoryEntry[];
  payment: PaymentRow | null;
}

export async function getOrderAdmin(id: string, db: DbOrTx = getDb()): Promise<AdminOrderDetail | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const [items, history, [payment]] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.position), asc(orderItems.id)),
    db
      .select({
        id: orderStatusHistory.id,
        fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus,
        actor: orderStatusHistory.actor,
        note: orderStatusHistory.note,
        createdAt: orderStatusHistory.createdAt,
        adminName: sql<string | null>`case when ${customers.id} is null then null else ${customers.firstName} || ' ' || ${customers.lastName} end`,
      })
      .from(orderStatusHistory)
      .leftJoin(customers, eq(customers.id, orderStatusHistory.adminId))
      .where(eq(orderStatusHistory.orderId, id))
      .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id)),
    db.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.createdAt)).limit(1),
  ]);
  return { order, items, history, payment: payment ?? null };
}
