import type { OutgoingEmail } from '../types';
import { buildAccountEmail } from './account-layout';
import { oneLine } from './appointment-common';
import {
  amountRows,
  DEMO_FOOTER,
  deliveryBlocks,
  headerRows,
  linkBlocks,
  paymentRow,
  recipientOf,
  type OrderEmailContext,
  type OrderEmailData,
} from './order-common';

// order_confirmed (contracts/emails.md): pedido con tarjeta que pasa a "Pagado".
export function orderConfirmed(ctx: OrderEmailContext, d: OrderEmailData): OutgoingEmail {
  return buildAccountEmail(
    ctx,
    recipientOf(d),
    oneLine(`Pedido ${d.number} confirmado`),
    [
      { p: 'Hemos recibido el pago y tu pedido está confirmado. Estos son los datos:' },
      { rows: headerRows(d) },
      { rows: amountRows(d) },
      ...deliveryBlocks(ctx, d),
      { rows: [paymentRow(d)] },
      ...linkBlocks(d),
      { p: DEMO_FOOTER },
    ],
  );
}
