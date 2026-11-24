import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { CancelOrderForm } from '@/components/admin/CancelOrderForm';
import { getOrder } from '@/db/queries/orders';
import { formatEur } from '@/domain/money';
import { allowedTransitions, statusLabel } from '@/domain/order-status';
import { CANCEL_NOTE_LIMITS, ordersBackPath, uuid } from '@/domain/store-schemas';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { cancelOrderAdmin } from '../../actions';

export const metadata: Metadata = { title: 'Cancelar el pedido' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Confirmación de la cancelación de un pedido con su motivo interno (US3, escenario 4; G10).
export default async function AdminCancelOrderPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  const [{ id }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  if (!uuid.safeParse(id).success) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  const back = ordersBackPath(first(sp.volver));
  const cancellable = allowedTransitions(order, 'clinic', now).includes('cancelled');
  const paid = order.status !== 'pending_payment' && order.paidAt !== null;
  const refundNote = !paid
    ? null
    : order.paymentMethod === 'in_clinic'
      ? 'El pedido se pagó en la clínica: devuelve el importe en el mostrador.'
      : 'El pedido está pagado: al cancelarlo se devolverá el importe al comprador en el mismo medio de pago.';
  return (
    <>
      <h2>Cancelar el pedido {order.number}</h2>
      <AdminNotice searchParams={sp} context="order" />
      <p>
        Estado actual: {statusLabel(order.status, order.refundStatus)} · Total: {formatEur(order.totalCents)}
      </p>
      {cancellable ? (
        <CancelOrderForm
          action={cancelOrderAdmin}
          submissionToken={createSubmissionToken(now)}
          orderId={order.id}
          from={order.status}
          back={back}
          refundNote={refundNote}
          noteMax={CANCEL_NOTE_LIMITS[1]}
        />
      ) : (
        <div className="notice" role="alert">
          <p>Este pedido ya no se puede cancelar desde el panel: está enviado, entregado o ya cancelado.</p>
          <p>
            <Link prefetch={false} href={`/admin/pedidos/${order.id}`}>
              Volver al pedido
            </Link>
          </p>
        </div>
      )}
    </>
  );
}
