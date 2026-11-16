import { desc, eq } from 'drizzle-orm';
import { formatEur } from '@/domain/money';
import { isOrderStatus, PAYMENT_METHOD_LABELS, statusLabel, type OrderStatus } from '@/domain/order-status';
import { formatDateTime } from '@/domain/time';
import { getDb } from '@/db/client';
import { getOrderByNumber, getOrderHistory, getOrderItems } from '@/db/queries/orders';
import { orders } from '@/db/schema';
import { sendEmailsSoon } from '@/email/outbox';
import { logger } from '@/lib/logger';
import { cancelOrder } from './cancel';
import { TransitionError, transitionOrder } from './transition';

// Gestión de pedidos por línea de órdenes (contracts/cli.md): excepción temporal al principio VIII
// mientras no haya panel. Usa las mismas funciones que usará el panel. La salida es para el operador
// de la clínica (puede incluir los datos del comprador); los logs, en cambio, solo llevan ids.

export const EXIT = { ok: 0, usage: 1, transition: 2, notFound: 3 } as const;

const USAGE = `Uso: npm run orders -- <orden>
  list [--status <estado>] [--limit N]
  show <número>
  set-status <número> <preparing|shipped|ready_for_pickup|delivered>
  deliver <número>
  cancel <número> [--note <texto>]`;

const SET_STATUS_TARGETS: readonly OrderStatus[] = ['preparing', 'shipped', 'ready_for_pickup', 'delivered'];

function option(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

export async function runOrdersCli(args: string[], out: (line: string) => void, now: Date): Promise<number> {
  const [command, ...rest] = args;
  switch (command) {
    case 'list':
      return list(rest, out);
    case 'show':
      return show(rest[0], out);
    case 'set-status':
      return setStatus(rest[0], rest[1], out, now);
    case 'deliver':
      return setStatus(rest[0], 'delivered', out, now);
    case 'cancel':
      return cancel(rest[0], option(rest, '--note'), out, now);
    default:
      out(USAGE);
      return EXIT.usage;
  }
}

async function list(args: string[], out: (line: string) => void): Promise<number> {
  const status = option(args, '--status');
  if (status !== null && !isOrderStatus(status)) {
    out(`Estado desconocido: ${status}`);
    return EXIT.usage;
  }
  const limitRaw = Number(option(args, '--limit') ?? 20);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 20;
  const rows = await getDb()
    .select()
    .from(orders)
    .where(status ? eq(orders.status, status as OrderStatus) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  if (rows.length === 0) out('No hay pedidos.');
  for (const o of rows) {
    out(
      [o.number, formatDateTime(o.createdAt), statusLabel(o.status, o.refundStatus), PAYMENT_METHOD_LABELS[o.paymentMethod], formatEur(o.totalCents)].join(' | '),
    );
  }
  return EXIT.ok;
}

async function show(number: string | undefined, out: (line: string) => void): Promise<number> {
  if (!number) {
    out(USAGE);
    return EXIT.usage;
  }
  const o = await getOrderByNumber(number);
  if (!o) {
    out(`No existe el pedido ${number}`);
    return EXIT.notFound;
  }
  const [items, history] = await Promise.all([getOrderItems(o.id), getOrderHistory(o.id)]);
  out(`Pedido ${o.number} · ${formatDateTime(o.createdAt)}`);
  out(`Estado: ${statusLabel(o.status, o.refundStatus)}${o.refundStatus === 'pending' ? ' (reembolso pendiente)' : ''}`);
  out(`Pago: ${PAYMENT_METHOD_LABELS[o.paymentMethod]}`);
  out(`Comprador: ${o.firstName ?? ''} ${o.lastName ?? ''} <${o.contactEmail ?? ''}>`.trim());
  out(`Entrega: ${o.shippingName}${o.addressLine ? ` · ${o.addressLine}, ${o.postalCode} ${o.city}` : ''}`);
  for (const i of items) out(`  ${i.quantity} × ${i.productName} · ${formatEur(i.unitPriceCents * i.quantity)}`);
  if (o.discountCode) out(`Descuento (${o.discountCode}): −${formatEur(o.discountCents)}`);
  out(`Envío: ${formatEur(o.shippingCostCents)} · Total: ${formatEur(o.totalCents)} (IVA incluido ${formatEur(o.vatCents)})`);
  out('Historial:');
  for (const h of history) out(`  ${formatDateTime(h.createdAt)} · ${statusLabel(h.toStatus)} (${h.actor})`);
  return EXIT.ok;
}

async function setStatus(number: string | undefined, target: string | undefined, out: (line: string) => void, now: Date): Promise<number> {
  if (!number || !target || !isOrderStatus(target) || !SET_STATUS_TARGETS.includes(target)) {
    out(USAGE);
    return EXIT.usage;
  }
  const o = await getOrderByNumber(number);
  if (!o) {
    out(`No existe el pedido ${number}`);
    return EXIT.notFound;
  }
  try {
    const result = await getDb().transaction((tx) => transitionOrder(tx, o.id, target, 'clinic', { now }));
    sendEmailsSoon(result.emailIds);
    logger.info({ event: 'order_status_set', order_id: o.id, to: target });
    out(`${o.number}: ${statusLabel(result.from)} → ${statusLabel(result.to)}`);
    return EXIT.ok;
  } catch (error) {
    if (error instanceof TransitionError) {
      out(error.message);
      return EXIT.transition;
    }
    throw error;
  }
}

async function cancel(number: string | undefined, note: string | null, out: (line: string) => void, now: Date): Promise<number> {
  if (!number) {
    out(USAGE);
    return EXIT.usage;
  }
  const o = await getOrderByNumber(number);
  if (!o) {
    out(`No existe el pedido ${number}`);
    return EXIT.notFound;
  }
  try {
    const { refund } = await cancelOrder(o.id, 'clinic', { reason: 'clinic', note: note ?? undefined, now });
    const refundText =
      refund === null || refund === 'not_needed'
        ? ''
        : refund === 'refunded'
          ? ' Reembolso hecho.'
          : refund === 'pending'
            ? ' Reembolso pendiente: se reintentará automáticamente.'
            : ' El reembolso ha fallado: revísalo en la pasarela.';
    out(`${o.number}: ${statusLabel(o.status)} → ${statusLabel('cancelled')}.${refundText}`);
    return EXIT.ok;
  } catch (error) {
    if (error instanceof TransitionError) {
      out(error.message);
      return EXIT.transition;
    }
    throw error;
  }
}
