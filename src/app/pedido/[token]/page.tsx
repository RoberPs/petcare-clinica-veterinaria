import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Notice } from '@/components/Notice';
import { OrderActions } from '@/components/OrderActions';
import { OrderDetail } from '@/components/OrderDetail';
import { isShopEnabled } from '@/db/queries/checkout-config';
import { getOrderHistory, getOrderItems } from '@/db/queries/orders';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { getNow } from '@/lib/clock';
import { clinicPickupInfo } from '@/lib/orders/clinic-info';
import { findGuestOrder } from '@/lib/orders/locate';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { ...privateMetadata, title: 'Tu pedido' };

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ aviso?: string | string[]; cancelar?: string | string[] }>;
};

// Enlace privado de un pedido de invitado (US6, D18). Token alterado, de otro pedido o de otra
// versión → 404; caducado → aviso con el contacto de la clínica y ningún dato del pedido.
export default async function GuestOrderPage({ params, searchParams }: Props) {
  if (!(await isShopEnabled())) notFound();
  const [{ token }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  const found = await findGuestOrder(token, now);
  if (found.status === 'not_found') notFound();
  const clinic = await clinicPickupInfo();

  if (found.status === 'expired') {
    return (
      <>
        <section className="page-hero page-hero--compact">
          <div className="container">
            <h1>Este enlace ha caducado</h1>
          </div>
        </section>
        <section className="section">
          <div className="container">
            <div className="panel" role="status">
              <p>
                Por seguridad, el enlace de tu pedido ya no muestra sus datos. Si necesitas algo sobre el pedido,
                llámanos al <a href={`tel:${clinic.phoneE164}`}>{clinic.phoneDisplay}</a> o escríbenos desde la página de
                contacto.
              </p>
              <Link prefetch={false} className="btn btn--pink" href="/contacto">
                Contacto
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  const order = found.order;
  const [items, history] = await Promise.all([getOrderItems(order.id), getOrderHistory(order.id)]);
  const selfUrl = `/pedido/${encodeURIComponent(token)}`;
  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <h1>Pedido {order.number}</h1>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <Notice code={sp.aviso} />
          <OrderActions
            order={order}
            now={now}
            field={{ name: 'token', value: token }}
            selfUrl={selfUrl}
            confirming={sp.cancelar === '1'}
          />
          <OrderDetail order={order} items={items} history={history} clinic={clinic} />
        </div>
      </section>
    </>
  );
}
