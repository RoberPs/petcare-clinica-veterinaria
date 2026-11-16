import { formatEur } from '@/domain/money';
import { CANCEL_REASON_TEXT } from '@/domain/order-status';
import type { OutgoingEmail } from '../types';
import { buildAccountEmail, type Block } from './account-layout';
import { oneLine } from './appointment-common';
import { amountRows, DEMO_FOOTER, headerRows, linkBlocks, recipientOf, type OrderEmailContext, type OrderEmailData } from './order-common';

/**
 * Frase del reembolso según el estado en el momento de la cancelación (contracts/emails.md). Sin
 * pago (pendiente o en clínica) no hay nada que devolver.
 */
export function refundSentence(d: Pick<OrderEmailData, 'refundStatus' | 'totalCents'>): string | null {
  if (d.refundStatus === 'refunded') return `Te hemos devuelto ${formatEur(d.totalCents)} en el mismo medio de pago (simulación).`;
  if (d.refundStatus === 'pending' || d.refundStatus === 'failed') {
    return `Estamos tramitando la devolución de ${formatEur(d.totalCents)} en el mismo medio de pago (simulación).`;
  }
  return null;
}

// order_cancelled (contracts/emails.md): cualquier cancelación salvo "replaced".
export function orderCancelled(ctx: OrderEmailContext, d: OrderEmailData): OutgoingEmail {
  const refund = refundSentence(d);
  const blocks: Block[] = [
    { p: 'Tu pedido se ha cancelado.' },
    ...(d.cancelReason ? [{ p: `Motivo: ${CANCEL_REASON_TEXT[d.cancelReason]}` }] : []),
    ...(refund ? [{ p: refund }] : []),
    { rows: headerRows(d) },
    { rows: amountRows(d) },
    ...linkBlocks(d),
    { p: `Si tienes alguna duda, llámanos al ${ctx.clinicPhone}.` },
    { p: DEMO_FOOTER },
  ];
  return buildAccountEmail(ctx, recipientOf(d), oneLine(`Pedido ${d.number} cancelado`), blocks);
}
