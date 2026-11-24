// Ciclo de vida del pedido (data-model.md). Es la ÚNICA tabla de transiciones: la usan el
// checkout, el webhook, la tarea de mantenimiento, el CLI y el panel futuro (transitionOrder).

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'preparing',
  'shipped',
  'ready_for_pickup',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderActor = 'customer' | 'system' | 'clinic' | 'gateway';
export type PaymentMethod = 'card' | 'in_clinic';
export type ShippingKind = 'home_delivery' | 'clinic_pickup';
export type CancelReason = 'customer' | 'expired' | 'replaced' | 'stock_unavailable' | 'clinic' | 'account_deleted';
export type ReservationStatus = 'held' | 'committed' | 'released';
export type RefundStatus = 'none' | 'pending' | 'refunded' | 'failed';

export interface OrderFacts {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  shippingKind: ShippingKind;
  cancelReason: CancelReason | null;
  /** Plazo de recogida del pago en clínica (feature 008: confirmar el pago solo mientras está vigente). */
  pickupDeadline?: Date | null;
}

interface Transition {
  from: readonly OrderStatus[];
  to: OrderStatus;
  actors: readonly OrderActor[];
  when?: (o: OrderFacts, now: Date) => boolean;
}

export const ORDER_TRANSITIONS: readonly Transition[] = [
  { from: ['pending_payment'], to: 'paid', actors: ['gateway'], when: (o) => o.paymentMethod === 'card' },
  // Feature 008 (G7, US5): la clínica registra el pago en el mostrador mientras el plazo de recogida sigue vigente.
  {
    from: ['pending_payment'],
    to: 'paid',
    actors: ['clinic'],
    when: (o, now) => o.paymentMethod === 'in_clinic' && o.pickupDeadline != null && o.pickupDeadline.getTime() > now.getTime(),
  },
  { from: ['pending_payment'], to: 'delivered', actors: ['clinic'], when: (o) => o.paymentMethod === 'in_clinic' },
  { from: ['pending_payment'], to: 'cancelled', actors: ['customer', 'system', 'clinic'] },
  // Pago tardío (D8): el pedido caducó, pero la pasarela confirma el cobro.
  {
    from: ['cancelled'],
    to: 'paid',
    actors: ['gateway'],
    when: (o) => o.paymentMethod === 'card' && o.cancelReason === 'expired',
  },
  { from: ['paid'], to: 'preparing', actors: ['clinic'] },
  { from: ['paid', 'preparing'], to: 'shipped', actors: ['clinic'], when: (o) => o.shippingKind === 'home_delivery' },
  {
    from: ['paid', 'preparing'],
    to: 'ready_for_pickup',
    actors: ['clinic'],
    when: (o) => o.shippingKind === 'clinic_pickup',
  },
  { from: ['shipped', 'ready_for_pickup'], to: 'delivered', actors: ['clinic'] },
  // Feature 008 (G7, US5): el pago en clínica se entrega en el mostrador; "Confirmar pago y entrega"
  // hace pending_payment → paid → delivered en una transacción.
  { from: ['paid'], to: 'delivered', actors: ['clinic'], when: (o) => o.paymentMethod === 'in_clinic' },
  // Cancelación de un pedido pagado: reembolso obligatorio y devolución del stock.
  { from: ['paid', 'preparing', 'ready_for_pickup'], to: 'cancelled', actors: ['clinic'] },
];

export function canTransition(order: OrderFacts, to: OrderStatus, actor: OrderActor, now: Date = new Date()): boolean {
  return ORDER_TRANSITIONS.some(
    (t) => t.to === to && t.from.includes(order.status) && t.actors.includes(actor) && (t.when?.(order, now) ?? true),
  );
}

/**
 * Estados a los que `actor` puede llevar el pedido ahora (G7), en el orden del ciclo de vida. Es lo
 * único que ofrece el panel: así "Cancelar" no aparece en un pedido enviado o entregado.
 */
export function allowedTransitions(order: OrderFacts, actor: OrderActor, now: Date): OrderStatus[] {
  return ORDER_STATUSES.filter((to) => to !== order.status && canTransition(order, to, actor, now));
}

/**
 * Nuevo estado de la reserva de stock al pasar a `to`, o null si no cambia:
 * - held → committed al pagar o entregar en clínica (el stock ya estaba descontado);
 * - held o committed → released al cancelar (se devuelven las unidades);
 * - released → committed en el pago tardío (hay que volver a reservar).
 */
export function reservationEffect(current: ReservationStatus, to: OrderStatus): ReservationStatus | null {
  if (to === 'cancelled') return current === 'released' ? null : 'released';
  if (to === 'paid' || to === 'delivered') return current === 'committed' ? null : 'committed';
  return null;
}

const LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pendiente de pago',
  paid: 'Pagado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  ready_for_pickup: 'Listo para recoger',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export function statusLabel(status: OrderStatus, refundStatus: RefundStatus = 'none'): string {
  return refundStatus === 'refunded' ? `${LABELS[status]} · Reembolsado` : LABELS[status];
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Tarjeta',
  in_clinic: 'Pago en la clínica',
};

export const CANCEL_REASON_TEXT: Record<CancelReason, string> = {
  customer: 'Lo cancelaste tú.',
  expired: 'Venció el plazo para completar el pago o la recogida.',
  replaced: 'Se sustituyó por un pedido nuevo.',
  stock_unavailable: 'No quedaban unidades suficientes cuando se confirmó el pago.',
  clinic: 'Lo canceló la clínica.',
  account_deleted: 'Se eliminó la cuenta.',
};
