import type { OutgoingEmail } from '../types';
import { buildAccountEmail } from './account-layout';
import { oneLine } from './appointment-common';
import {
  amountRows,
  DEMO_FOOTER,
  deliveryBlocks,
  headerRows,
  linkBlocks,
  longDate,
  paymentRow,
  recipientOf,
  type OrderEmailContext,
  type OrderEmailData,
} from './order-common';

// order_received (contracts/emails.md): pedido con pago en la clínica, con el plazo de recogida.
export function orderReceived(ctx: OrderEmailContext, d: OrderEmailData): OutgoingEmail {
  const deadline = d.pickupDeadline ? longDate(new Date(d.pickupDeadline.getTime() - 1)) : null;
  return buildAccountEmail(
    ctx,
    recipientOf(d),
    oneLine(`Pedido ${d.number} recibido: pago en la clínica`),
    [
      {
        p: deadline
          ? `Hemos recibido tu pedido y lo tenemos reservado. Pásate a recogerlo y pagarlo en la clínica hasta el ${deadline}; si no, se cancelará.`
          : 'Hemos recibido tu pedido y lo tenemos reservado. Pásate a recogerlo y pagarlo en la clínica.',
      },
      { rows: headerRows(d) },
      { rows: amountRows(d) },
      ...deliveryBlocks(ctx, d),
      { rows: [paymentRow(d)] },
      ...linkBlocks(d),
      { p: DEMO_FOOTER },
    ],
    { footer: `${ctx.clinicName} · ${ctx.clinicAddress} · Teléfono ${ctx.clinicPhone}` },
  );
}
