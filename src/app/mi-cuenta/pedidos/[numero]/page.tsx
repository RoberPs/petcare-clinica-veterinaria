import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Notice } from '@/components/Notice';
import { OrderActions } from '@/components/OrderActions';
import { OrderDetail } from '@/components/OrderDetail';
import { isShopEnabled } from '@/db/queries/checkout-config';
import { getCustomerOrder, getOrderHistory, getOrderItems } from '@/db/queries/orders';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { requireCustomer } from '@/lib/auth/require-customer';
import { getNow } from '@/lib/clock';
import { clinicPickupInfo } from '@/lib/orders/clinic-info';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { ...privateMetadata, title: 'Detalle del pedido' };

type Props = {
  params: Promise<{ numero: string }>;
  searchParams: Promise<{ aviso?: string | string[]; cancelar?: string | string[] }>;
};

// Detalle de un pedido propio (US5). Un número ajeno o inexistente da el mismo 404 (SC-006).
export default async function CustomerOrderPage({ params, searchParams }: Props) {
  const customer = await requireCustomer();
  if (!(await isShopEnabled())) notFound();
  const [{ numero }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  const order = await getCustomerOrder(customer.id, numero);
  if (!order) notFound();
  const [items, history, clinic] = await Promise.all([getOrderItems(order.id), getOrderHistory(order.id), clinicPickupInfo()]);
  const selfUrl = `/mi-cuenta/pedidos/${encodeURIComponent(order.number)}`;

  return (
    <>
      <Notice code={sp.aviso} />
      <h2>Pedido {order.number}</h2>
      <OrderActions
        order={order}
        now={now}
        field={{ name: 'numero', value: order.number }}
        selfUrl={selfUrl}
        confirming={sp.cancelar === '1'}
      />
      <OrderDetail order={order} items={items} history={history} clinic={clinic} headingLevel={3} />
      <p>
        <Link prefetch={false} className="link-back" href="/mi-cuenta/pedidos">
          Volver a mis pedidos
        </Link>
      </p>
    </>
  );
}
