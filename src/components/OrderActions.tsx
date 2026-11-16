import Link from 'next/link';
import { cancelPendingOrder, retryPayment } from '@/app/pedido/actions';
import type { OrderRow } from '@/db/queries/orders';

interface Props {
  order: OrderRow;
  now: Date;
  /** Campo que identifica el pedido en las acciones: numero (con sesión) o token (invitado). */
  field: { name: 'numero' | 'token'; value: string };
  /** URL de la página actual (sin ?cancelar=1). */
  selfUrl: string;
  /** Paso de confirmación de la cancelación (?cancelar=1). */
  confirming: boolean;
}

// "Reintentar pago" (tarjeta pendiente y en plazo) y "Cancelar pedido" con un segundo paso de
// confirmación. Formularios normales: funcionan sin JavaScript. Nada si el pedido no está pendiente.
export function OrderActions({ order, now, field, selfUrl, confirming }: Props) {
  if (order.status !== 'pending_payment') return null;
  const canRetry =
    order.paymentMethod === 'card' && order.reservationExpiresAt !== null && order.reservationExpiresAt.getTime() > now.getTime();
  const hidden = <input type="hidden" name={field.name} value={field.value} />;

  if (confirming) {
    return (
      <div className="panel">
        <h2>¿Cancelar el pedido {order.number}?</h2>
        <p>Se liberarán los productos reservados y no se cobrará nada.</p>
        <div className="form-actions">
          <form action={cancelPendingOrder}>
            {hidden}
            <input type="hidden" name="confirm" value="si" />
            <button className="btn" type="submit">
              Sí, cancelar el pedido
            </button>
          </form>
          <Link prefetch={false} className="btn btn--ghost" href={selfUrl}>
            No, volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="form-actions">
      {canRetry ? (
        <form action={retryPayment}>
          {hidden}
          <button className="btn" type="submit">
            Reintentar pago
          </button>
        </form>
      ) : null}
      <Link prefetch={false} className="btn btn--ghost" href={`${selfUrl}${selfUrl.includes('?') ? '&' : '?'}cancelar=1`}>
        Cancelar pedido
      </Link>
    </div>
  );
}
