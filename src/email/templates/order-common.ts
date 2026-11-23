import { formatEur } from '@/domain/money';
import { PAYMENT_METHOD_LABELS, statusLabel, type CancelReason, type OrderStatus, type PaymentMethod, type RefundStatus, type ShippingKind } from '@/domain/order-status';
import { formatDateTime, formatLongDate, zonedNow } from '@/domain/time';
import type { EmailContext } from '../outbox';
import type { Block } from './account-layout';

// Piezas comunes de los correos de pedido (contracts/emails.md). Todas las cifras salen de la copia
// guardada en el pedido (SC-005): aquí no se calcula ningún importe.

export interface OrderEmailContext extends EmailContext {
  /** Horario resumido de la clínica ("Lunes a viernes: 09:30–14:00…"). */
  clinicHours: string[];
}

export interface OrderEmailItem {
  name: string;
  quantity: number;
  /** Unitario × cantidad (el descuento va en su propia fila). */
  amountCents: number;
}

export interface OrderEmailData {
  number: string;
  createdAt: Date;
  firstName: string;
  lastName: string;
  email: string;
  status: OrderStatus;
  refundStatus: RefundStatus;
  items: OrderEmailItem[];
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
  shippingCents: number;
  totalCents: number;
  vatCents: number;
  shippingKind: ShippingKind;
  shippingName: string;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  paymentMethod: PaymentMethod;
  pickupDeadline: Date | null;
  cancelReason: CancelReason | null;
  /** URL absoluta del pedido: el área del cliente o el enlace privado de invitado. */
  link: string;
  /** Validez del enlace de invitado en días (null si es del área del cliente). */
  guestLinkDays: number | null;
}

export const DEMO_FOOTER = 'Tienda de demostración: no se ha cobrado nada y no se enviará ningún producto.';

export const recipientOf = (d: OrderEmailData) => ({ email: d.email, firstName: d.firstName });

/** "12 de noviembre de 2026" en Europe/Madrid. */
export const longDate = (date: Date) => formatLongDate(zonedNow(date).toPlainDate().toString());

export function headerRows(d: OrderEmailData): [string, string][] {
  return [
    ['Pedido', d.number],
    ['Fecha', formatDateTime(d.createdAt)],
    ['Estado', statusLabel(d.status, d.refundStatus)],
  ];
}

/** Líneas y totales con IVA (las mismas cifras del carrito y el checkout). */
export function amountRows(d: OrderEmailData): [string, string][] {
  return [
    ...d.items.map((i): [string, string] => [`${i.name} × ${i.quantity}`, formatEur(i.amountCents)]),
    ['Subtotal', formatEur(d.subtotalCents)],
    ...(d.discountCents > 0 ? [[`Descuento${d.discountCode ? ` (${d.discountCode})` : ''}`, `−${formatEur(d.discountCents)}`] as [string, string]] : []),
    ['Envío', d.shippingCents === 0 ? 'Gratis' : formatEur(d.shippingCents)],
    ['Total', formatEur(d.totalCents)],
    ['IVA incluido', formatEur(d.vatCents)],
  ];
}

/** Envío a domicilio con la dirección, o recogida con la dirección y el horario de la clínica. */
export function deliveryBlocks(ctx: OrderEmailContext, d: OrderEmailData): Block[] {
  if (d.shippingKind === 'home_delivery') {
    return [{ rows: [[d.shippingName, `${d.addressLine ?? ''}, ${d.postalCode ?? ''} ${d.city ?? ''}`.trim()]] }];
  }
  const rows: [string, string][] = [
    [d.shippingName, ctx.clinicAddress],
    ['Horario', ctx.clinicHours.join(' · ') || 'Consulta el horario en la web'],
  ];
  if (d.pickupDeadline && d.paymentMethod === 'in_clinic') rows.push(['Recógelo antes del', longDate(new Date(d.pickupDeadline.getTime() - 1))]);
  return [{ rows }];
}

export function paymentRow(d: OrderEmailData): [string, string] {
  return ['Pago', d.paymentMethod === 'in_clinic' && d.status === 'pending_payment' ? 'Pago en la clínica (pendiente)' : PAYMENT_METHOD_LABELS[d.paymentMethod]];
}

export function linkBlocks(d: OrderEmailData): Block[] {
  return [
    { link: { label: 'Ver el pedido', href: d.link } },
    ...(d.guestLinkDays ? [{ p: `Este enlace es personal y vale ${d.guestLinkDays} días desde el último cambio del pedido. No lo compartas.` }] : []),
  ];
}
