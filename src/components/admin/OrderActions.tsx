import Link from 'next/link';
import type { OrderRow } from '@/db/queries/orders';
import { allowedTransitions, type OrderStatus } from '@/domain/order-status';

// Acciones del detalle de un pedido (US3 y US5, G7 y G16). Solo se ofrecen las transiciones que
// permite la tabla única para la clínica en este momento; cada formulario envía el estado que se
// ve (`from`) para detectar cambios simultáneos (G8). Funcionan sin JavaScript.

type FormAction = (form: FormData) => Promise<void>;

interface Props {
  order: OrderRow;
  now: Date;
  submissionToken: string;
  /** Query de la lista para volver (se conserva tras cada acción). */
  back: string;
  actions: { setStatus: FormAction; retryRefund: FormAction; confirmInClinic: FormAction };
}

const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  preparing: 'Pasar a «En preparación»',
  shipped: 'Marcar como enviado',
  ready_for_pickup: 'Marcar como listo para recoger',
  delivered: 'Marcar como entregado',
};

function Hidden({ order, token, back }: { order: OrderRow; token: string; back: string }) {
  return (
    <>
      <input type="hidden" name="submission" value={token} />
      <input type="hidden" name="id" value={order.id} />
      <input type="hidden" name="from" value={order.status} />
      <input type="hidden" name="volver" value={back} />
    </>
  );
}

export function OrderActions({ order, now, submissionToken, back, actions }: Props) {
  const allowed = allowedTransitions(order, 'clinic', now);
  const pendingInClinic = order.status === 'pending_payment' && order.paymentMethod === 'in_clinic';
  // Pendiente: el pago en la clínica tiene sus dos botones (US5); el resto, uno por transición.
  const advance = order.status === 'pending_payment' ? [] : allowed.filter((s) => s !== 'cancelled' && ADVANCE_LABEL[s]);
  const canConfirm = pendingInClinic && allowed.includes('paid');
  const canCancel = allowed.includes('cancelled');
  const retry = order.refundStatus === 'failed';
  if (advance.length === 0 && !canConfirm && !canCancel && !retry) return null;
  const cancelHref = `/admin/pedidos/${order.id}/cancelar?volver=${encodeURIComponent(back)}`;
  return (
    <section className="panel admin-section" aria-labelledby="pedido-acciones">
      <h3 id="pedido-acciones">Acciones</h3>
      <div className="admin-actions">
        {canConfirm ? (
          <>
            <form action={actions.confirmInClinic}>
              <Hidden order={order} token={submissionToken} back={back} />
              <button className="btn btn--mint" type="submit">
                Confirmar pago
              </button>
            </form>
            <form action={actions.confirmInClinic}>
              <Hidden order={order} token={submissionToken} back={back} />
              <input type="hidden" name="deliver" value="1" />
              <button className="btn btn--mint" type="submit">
                Confirmar pago y entrega
              </button>
            </form>
          </>
        ) : null}
        {advance.map((to) => (
          <form key={to} action={actions.setStatus}>
            <Hidden order={order} token={submissionToken} back={back} />
            <input type="hidden" name="to" value={to} />
            <button className="btn" type="submit">
              {ADVANCE_LABEL[to]}
            </button>
          </form>
        ))}
        {retry ? (
          <form action={actions.retryRefund}>
            <Hidden order={order} token={submissionToken} back={back} />
            <button className="btn" type="submit">
              Reintentar reembolso
            </button>
          </form>
        ) : null}
        {canCancel ? (
          <Link prefetch={false} className="btn btn--ghost" href={cancelHref}>
            Cancelar pedido
          </Link>
        ) : null}
      </div>
      {pendingInClinic && !canConfirm ? <p>El plazo de recogida ha vencido: el pedido se cancelará automáticamente.</p> : null}
    </section>
  );
}
