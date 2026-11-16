import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckoutSteps } from '@/components/CheckoutSteps';
import { OrderDetail } from '@/components/OrderDetail';
import { isShopEnabled } from '@/db/queries/checkout-config';
import { getOrder, getOrderItems, latestPayment, type OrderRow } from '@/db/queries/orders';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { getNow } from '@/lib/clock';
import { verifyOrderRef } from '@/lib/orders/access';
import { clinicPickupInfo } from '@/lib/orders/clinic-info';
import { reconcilePayment } from '@/lib/payments/webhook';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { ...privateMetadata, title: 'Confirmación del pedido' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const PAID_STATES: ReadonlySet<OrderRow['status']> = new Set(['paid', 'preparing', 'shipped', 'ready_for_pickup', 'delivered']);

/**
 * Vuelta de la pasarela (D7). Si el aviso firmado aún no ha llegado, concilia con la pasarela con
 * la clave secreta y aplica el mismo camino (markOrderPaid es idempotente). Sin ref válida de menos
 * de 2 h, un mensaje genérico sin datos.
 */
async function loadOrder(ref: string | undefined, now: Date): Promise<OrderRow | null> {
  const orderId = verifyOrderRef(ref, now);
  let order = orderId ? await getOrder(orderId) : null;
  if (order && order.paymentMethod === 'card' && order.status === 'pending_payment') {
    const payment = await latestPayment(order.id);
    if (payment && payment.status === 'open') {
      await reconcilePayment(payment, now);
      order = await getOrder(order.id);
    }
  }
  return order;
}

export default async function OrderConfirmedPage({ searchParams }: Props) {
  if (!(await isShopEnabled())) notFound();
  const [sp, now] = await Promise.all([searchParams, getNow()]);
  const ref = Array.isArray(sp.ref) ? sp.ref[0] : sp.ref;
  const order = await loadOrder(ref, now);
  const [items, clinic] = order ? await Promise.all([getOrderItems(order.id), clinicPickupInfo()]) : [[], null];

  const paid = order ? PAID_STATES.has(order.status) : false;
  const inClinic = order?.paymentMethod === 'in_clinic' && order.status === 'pending_payment';
  const waiting = order?.paymentMethod === 'card' && order.status === 'pending_payment';
  const title = !order
    ? 'Confirmación del pedido'
    : paid
      ? `Pedido ${order.number} confirmado`
      : inClinic
        ? `Pedido ${order.number} recibido`
        : waiting
          ? 'Estamos confirmando tu pago'
          : `Pedido ${order.number} cancelado`;

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <h1>{title}</h1>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <CheckoutSteps current={3} cartHref={null} />
          {!order || !clinic ? (
            <div className="panel" role="status">
              <p>
                Si has hecho un pedido, te hemos enviado los detalles por correo. Este enlace ya no muestra los datos del
                pedido.
              </p>
              <Link prefetch={false} className="btn" href="/productos">
                Seguir comprando
              </Link>
            </div>
          ) : waiting ? (
            <div className="panel" role="status">
              <p>
                Todavía no hemos recibido la confirmación de la pasarela de pago. Suele tardar unos segundos. No vuelvas a
                pagar.
              </p>
              <a className="btn" href={`/pedido/confirmado?ref=${encodeURIComponent(ref ?? '')}`}>
                Comprobar de nuevo
              </a>
            </div>
          ) : (
            <>
              <div className={paid || inClinic ? 'form-success order-confirmed' : 'panel'} role="status">
                <p>
                  {paid
                    ? 'Hemos recibido el pago. Te hemos enviado la confirmación por correo.'
                    : inClinic
                      ? 'Tenemos tu pedido reservado. Pásate a recogerlo y pagarlo en la clínica en el plazo indicado.'
                      : 'Este pedido está cancelado: no se ha cobrado nada.'}
                </p>
              </div>
              <OrderDetail order={order} items={items} clinic={clinic} />
              <p>
                <Link prefetch={false} className="link-back" href="/productos">
                  Seguir comprando
                </Link>
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
