import type { OrderStatus } from '@/domain/order-status';
import type { OutgoingEmail } from '../types';
import { buildAccountEmail, type Block } from './account-layout';
import { oneLine } from './appointment-common';
import { amountRows, DEMO_FOOTER, deliveryBlocks, headerRows, linkBlocks, longDate, recipientOf, type OrderEmailContext, type OrderEmailData } from './order-common';

// order_status (feature 008, contracts/emails.md): cambio de estado hecho por la clínica, desde el
// panel o la CLI. Una sola plantilla con una variante por estado. Nunca lleva el motivo interno de
// la clínica (la cancelación sigue con order_cancelled).

export const ORDER_STATUS_EMAIL_STATES = ['paid', 'preparing', 'shipped', 'ready_for_pickup', 'delivered'] as const;
export type OrderStatusEmailState = (typeof ORDER_STATUS_EMAIL_STATES)[number];

export function isOrderStatusEmailState(status: OrderStatus): status is OrderStatusEmailState {
  return (ORDER_STATUS_EMAIL_STATES as readonly string[]).includes(status);
}

export interface OrderStatusEmailOptions {
  /** "Confirmar pago y entrega" en un solo paso (US5): un único correo. */
  combined?: boolean;
  /** Plazo de entrega a domicilio (shop_settings.shipping_text). */
  shippingText?: string | null;
}

const SUBJECT: Record<OrderStatusEmailState, string> = {
  paid: 'pago registrado',
  preparing: 'en preparación',
  shipped: 'enviado',
  ready_for_pickup: 'listo para recoger',
  delivered: 'entregado',
};

function variant(ctx: OrderEmailContext, d: OrderEmailData, state: OrderStatusEmailState, options: OrderStatusEmailOptions): Block[] {
  switch (state) {
    case 'paid':
      return [
        { p: 'Hemos registrado tu pago en la clínica.' },
        { p: 'Recuerda pasar a recoger tu pedido en la clínica.' },
        ...deliveryBlocks(ctx, { ...d, pickupDeadline: null }),
      ];
    case 'preparing':
      return [{ p: 'Estamos preparando tu pedido.' }];
    case 'shipped':
      return [
        { p: 'Tu pedido va de camino.' },
        ...(options.shippingText ? [{ p: `Plazo de entrega: ${options.shippingText}.` }] : []),
        ...deliveryBlocks(ctx, d),
      ];
    case 'ready_for_pickup':
      return [
        { p: 'Tu pedido está listo para recoger en la clínica.' },
        ...deliveryBlocks(ctx, { ...d, pickupDeadline: null }),
        ...(d.pickupDeadline ? [{ p: `Puedes recogerlo hasta el ${longDate(new Date(d.pickupDeadline.getTime() - 1))} (incluido).` }] : []),
      ];
    case 'delivered':
      return [{ p: options.combined ? 'Pago confirmado y pedido entregado. ¡Gracias por tu compra!' : 'Pedido entregado. ¡Gracias por tu compra!' }];
  }
}

export function orderStatus(ctx: OrderEmailContext, d: OrderEmailData, state: OrderStatusEmailState, options: OrderStatusEmailOptions = {}): OutgoingEmail {
  const subject = state === 'delivered' && options.combined ? 'pagado y entregado' : SUBJECT[state];
  const blocks: Block[] = [
    ...variant(ctx, d, state, options),
    { rows: headerRows(d) },
    { rows: amountRows(d) },
    ...linkBlocks(d),
    { p: `Si tienes alguna duda, llámanos al ${ctx.clinicPhone}.` },
    { p: DEMO_FOOTER },
  ];
  return buildAccountEmail(ctx, recipientOf(d), oneLine(`Pedido ${d.number}: ${subject}`), blocks);
}
