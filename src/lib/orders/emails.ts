import { asc } from 'drizzle-orm';
import { summarizeHours } from '@/domain/hours';
import type { DbOrTx } from '@/db/client';
import { getCheckoutSettings } from '@/db/queries/checkout-config';
import { getOrder, getOrderItems } from '@/db/queries/orders';
import { openingHours, shopSettings } from '@/db/schema';
import { enqueueEmail, getEmailContext, type OrderEmailKind } from '@/email/outbox';
import { orderCancelled } from '@/email/templates/order-cancelled';
import { orderClinic } from '@/email/templates/order-clinic';
import type { OrderEmailContext, OrderEmailData } from '@/email/templates/order-common';
import { orderConfirmed } from '@/email/templates/order-confirmed';
import { orderReceived } from '@/email/templates/order-received';
import { orderStatus, type OrderStatusEmailState } from '@/email/templates/order-status';
import { orderPath } from './access';

// Encolado de los correos de pedido (D17): se renderizan con la copia del pedido y se encolan en la
// misma transacción que el cambio, con su order_id. Devuelven los ids para el intento inmediato.

export async function orderEmailContext(tx: DbOrTx): Promise<OrderEmailContext> {
  const [ctx, hours] = await Promise.all([
    getEmailContext(tx),
    tx
      .select({ weekday: openingHours.weekday, opensAt: openingHours.opensAt, closesAt: openingHours.closesAt })
      .from(openingHours)
      .orderBy(asc(openingHours.weekday), asc(openingHours.opensAt)),
  ]);
  return { ...ctx, clinicHours: summarizeHours(hours).map((l) => `${l.days}: ${l.hours}`) };
}

export async function orderEmailData(tx: DbOrTx, orderId: string, siteUrl: string): Promise<OrderEmailData | null> {
  const [order, items, settings] = await Promise.all([getOrder(orderId, tx), getOrderItems(orderId, tx), getCheckoutSettings()]);
  // Un pedido anonimizado ya no tiene a quién escribir.
  if (!order || !order.contactEmail || !order.firstName || !order.lastName) return null;
  return {
    number: order.number,
    createdAt: order.createdAt,
    firstName: order.firstName,
    lastName: order.lastName,
    email: order.contactEmail,
    status: order.status,
    refundStatus: order.refundStatus,
    items: items.map((i) => ({ name: i.productName, quantity: i.quantity, amountCents: i.unitPriceCents * i.quantity })),
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    discountCode: order.discountCode,
    shippingCents: order.shippingCostCents,
    totalCents: order.totalCents,
    vatCents: order.vatCents,
    shippingKind: order.shippingKind,
    shippingName: order.shippingName,
    addressLine: order.addressLine,
    postalCode: order.postalCode,
    city: order.city,
    paymentMethod: order.paymentMethod,
    pickupDeadline: order.pickupDeadline,
    cancelReason: order.cancelReason,
    link: `${siteUrl}${orderPath(order)}`,
    guestLinkDays: order.customerId ? null : (settings?.guestLinkDays ?? 90),
  };
}

const RENDER = {
  order_confirmed: orderConfirmed,
  order_received: orderReceived,
  order_cancelled: orderCancelled,
  clinic_order: orderClinic,
} as const;

/** Encola los correos de un pedido. Devuelve los ids encolados (vacío si el pedido está anonimizado). */
export async function enqueueOrderEmails(tx: DbOrTx, orderId: string, kinds: readonly OrderEmailKind[]): Promise<string[]> {
  if (kinds.length === 0) return [];
  const ctx = await orderEmailContext(tx);
  const data = await orderEmailData(tx, orderId, ctx.siteUrl);
  if (!data) return [];
  const order = await getOrder(orderId, tx);
  const ids: string[] = [];
  for (const kind of kinds) {
    const email = RENDER[kind](ctx, data);
    const { id } = await enqueueEmail(tx, { kind, to: email.to.email, email, customerId: order?.customerId ?? null, orderId });
    ids.push(id);
  }
  return ids;
}

/**
 * Encola el correo order_status (feature 008, G11): cambio de estado hecho por la clínica. Con
 * `combined`, la variante "pago confirmado y pedido entregado". Devuelve el id o null si el pedido
 * está anonimizado.
 */
export async function enqueueOrderStatusEmail(
  tx: DbOrTx,
  orderId: string,
  state: OrderStatusEmailState,
  options: { combined?: boolean } = {},
): Promise<string | null> {
  const ctx = await orderEmailContext(tx);
  const data = await orderEmailData(tx, orderId, ctx.siteUrl);
  if (!data) return null;
  const [settings] = await tx.select({ shippingText: shopSettings.shippingText }).from(shopSettings).limit(1);
  const order = await getOrder(orderId, tx);
  const email = orderStatus(ctx, data, state, { combined: options.combined, shippingText: settings?.shippingText ?? null });
  const { id } = await enqueueEmail(tx, { kind: 'order_status', to: email.to.email, email, customerId: order?.customerId ?? null, orderId });
  return id;
}
