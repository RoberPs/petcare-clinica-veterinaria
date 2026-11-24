import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { OrderActions } from '@/components/admin/OrderActions';
import { OrderDetail } from '@/components/admin/OrderDetail';
import { getOrderAdmin } from '@/db/queries/admin-orders';
import { ordersBackPath, uuid } from '@/domain/store-schemas';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { confirmInClinicPayment, retryRefundAdmin, setOrderStatusAdmin } from '../actions';

export const metadata: Metadata = { title: 'Detalle del pedido' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Detalle de un pedido (US2, escenario 3) con sus acciones (US3 y US5). "Volver" lleva a la lista
// con su filtro (?volver=, G6).
export default async function AdminOrderPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  const [{ id }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  if (!uuid.safeParse(id).success) notFound();
  const detail = await getOrderAdmin(id);
  if (!detail) notFound();
  const back = ordersBackPath(first(sp.volver));
  return (
    <>
      <p>
        <Link prefetch={false} href={back}>
          Volver a los pedidos
        </Link>
      </p>
      <AdminNotice searchParams={sp} context="order" />
      <OrderDetail detail={detail}>
        <OrderActions
          order={detail.order}
          now={now}
          submissionToken={createSubmissionToken(now)}
          back={back}
          actions={{ setStatus: setOrderStatusAdmin, retryRefund: retryRefundAdmin, confirmInClinic: confirmInClinicPayment }}
        />
      </OrderDetail>
    </>
  );
}
