import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Notice } from '@/components/Notice';
import { formatEur } from '@/domain/money';
import { statusLabel } from '@/domain/order-status';
import { isShopEnabled } from '@/db/queries/checkout-config';
import { getOrder } from '@/db/queries/orders';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { getNow } from '@/lib/clock';
import { verifyOrderRef } from '@/lib/orders/access';
import { cancelPendingOrder, retryPayment } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { ...privateMetadata, title: 'No se ha completado el pago' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Vuelta de la pasarela sin pago (cancelado o rechazado). El carrito sigue intacto: con tarjeta solo
// se vacía al confirmarse el pago. "Cancelar pedido" pide confirmación en un segundo paso (?cancelar=1).
export default async function PaymentNotCompletedPage({ searchParams }: Props) {
  if (!(await isShopEnabled())) notFound();
  const [sp, now] = await Promise.all([searchParams, getNow()]);
  const ref = (Array.isArray(sp.ref) ? sp.ref[0] : sp.ref) ?? '';
  const orderId = verifyOrderRef(ref, now);
  const order = orderId ? await getOrder(orderId) : null;
  const pending = order?.status === 'pending_payment' && order.paymentMethod === 'card';
  const inTime = pending && order.reservationExpiresAt !== null && order.reservationExpiresAt.getTime() > now.getTime();
  const confirming = pending && sp.cancelar === '1';
  const selfUrl = `/pedido/pago-no-completado?ref=${encodeURIComponent(ref)}`;

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <h1>{order && !pending ? `Pedido ${order.number}` : 'No se ha completado el pago'}</h1>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <Notice code={sp.aviso} />
          {!order ? (
            <div className="panel" role="status">
              <p>Este enlace ya no muestra los datos del pedido. Tu carrito sigue guardado.</p>
              <Link prefetch={false} className="btn" href="/carrito">
                Volver al carrito
              </Link>
            </div>
          ) : !pending ? (
            <div className="panel" role="status">
              <p>Estado: {statusLabel(order.status, order.refundStatus)}.</p>
              {order.status === 'pending_payment' ? null : order.status === 'cancelled' ? (
                <Link prefetch={false} className="btn" href="/carrito">
                  Volver al carrito
                </Link>
              ) : (
                <a className="btn" href={`/pedido/confirmado?ref=${encodeURIComponent(ref)}`}>
                  Ver el pedido
                </a>
              )}
            </div>
          ) : confirming ? (
            <div className="panel">
              <h2>¿Cancelar el pedido {order.number}?</h2>
              <p>Se liberarán los productos reservados. Tu carrito no cambia.</p>
              <div className="form-actions">
                <form action={cancelPendingOrder}>
                  <input type="hidden" name="ref" value={ref} />
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
          ) : (
            <div className="panel">
              <p>
                El pedido {order.number} ({formatEur(order.totalCents)}) sigue pendiente de pago y no se ha cobrado nada. Tu
                carrito sigue intacto.
              </p>
              {inTime ? null : <p>El plazo de pago ha vencido.</p>}
              <div className="form-actions">
                {inTime ? (
                  <form action={retryPayment}>
                    <input type="hidden" name="ref" value={ref} />
                    <button className="btn" type="submit">
                      Reintentar pago
                    </button>
                  </form>
                ) : null}
                <Link prefetch={false} className="btn btn--ghost" href="/carrito">
                  Volver al carrito
                </Link>
                <Link prefetch={false} className="btn btn--ghost" href={`${selfUrl}&cancelar=1`}>
                  Cancelar pedido
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
