import { PAYMENT_METHOD_LABELS } from '@/domain/order-status';
import type { OutgoingEmail } from '../types';
import { buildAccountEmail } from './account-layout';
import { oneLine } from './appointment-common';
import { amountRows, headerRows, type OrderEmailContext, type OrderEmailData } from './order-common';

// clinic_order (contracts/emails.md): a la clínica, en cada pedido nuevo pagado o con pago en
// clínica. Sin enlace de gestión: los cambios se hacen con el CLI (contracts/cli.md).
export function orderClinic(ctx: OrderEmailContext, d: OrderEmailData): OutgoingEmail {
  const delivery: [string, string] =
    d.shippingKind === 'home_delivery'
      ? [d.shippingName, `${d.addressLine ?? ''}, ${d.postalCode ?? ''} ${d.city ?? ''}`.trim()]
      : [d.shippingName, 'Recogida en la clínica'];
  return buildAccountEmail(
    ctx,
    { email: ctx.inboxEmail, firstName: ctx.clinicName },
    oneLine(`Nuevo pedido ${d.number}`),
    [
      { rows: headerRows(d) },
      { rows: [['Comprador', `${d.firstName} ${d.lastName}`], ['Correo', d.email], delivery, ['Pago', d.paymentMethod === 'in_clinic' ? 'Pago en la clínica (pendiente)' : PAYMENT_METHOD_LABELS[d.paymentMethod]]] },
      { rows: amountRows(d) },
      { p: `Gestión: node cli/orders.mjs show ${d.number}` },
    ],
    { greeting: null, replyTo: { email: d.email, name: `${d.firstName} ${d.lastName}` } },
  );
}
