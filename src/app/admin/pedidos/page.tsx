import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { OrderFilters, statusBadgeClass } from '@/components/admin/OrderFilters';
import { Pagination } from '@/components/Pagination';
import { ADMIN_ORDERS_PAGE_SIZE, countOrdersByStatus, listOrdersAdmin, normalizeOrderNumber } from '@/db/queries/admin-orders';
import { formatEur } from '@/domain/money';
import { isOrderStatus, PAYMENT_METHOD_LABELS, statusLabel } from '@/domain/order-status';
import { formatDateTime } from '@/domain/time';
import { requireAdmin } from '@/lib/auth/require-admin';

export const metadata: Metadata = { title: 'Pedidos' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Pedidos de la tienda (US2, G6): pestañas de estado con su recuento, búsqueda por número y lista
// paginada. Todo por GET: funciona sin JavaScript y el filtro se conserva al volver del detalle.
export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const statusRaw = first(sp.estado) ?? '';
  const status = isOrderStatus(statusRaw) ? statusRaw : null;
  const number = normalizeOrderNumber(first(sp.numero) ?? '');
  const pageRaw = Number(first(sp.pagina) ?? 1);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const [{ rows, total }, counts] = await Promise.all([listOrdersAdmin({ status, number, page }), countOrdersByStatus()]);
  const pages = Math.max(1, Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE));
  const listQuery = (n: number) => {
    const p = new URLSearchParams();
    if (status) p.set('estado', status);
    if (number) p.set('numero', number);
    if (n > 1) p.set('pagina', String(n));
    const s = p.toString();
    return s ? `/admin/pedidos?${s}` : '/admin/pedidos';
  };
  const back = encodeURIComponent(listQuery(page));

  return (
    <>
      <div className="admin-heading">
        <h2>Pedidos</h2>
      </div>
      <AdminNotice searchParams={sp} context="order" />
      <OrderFilters current={status} counts={counts} number={number} />
      <form className="admin-search" method="get" action="/admin/pedidos" role="search" aria-label="Buscar pedidos por número">
        {status ? <input type="hidden" name="estado" value={status} /> : null}
        <div className="field">
          <label htmlFor="buscar-numero">Número de pedido</label>
          <input id="buscar-numero" type="search" name="numero" defaultValue={number} maxLength={20} />
        </div>
        <button className="btn" type="submit">
          Buscar
        </button>
        {number ? (
          <Link prefetch={false} className="btn btn--ghost" href={status ? `/admin/pedidos?estado=${status}` : '/admin/pedidos'}>
            Quitar búsqueda
          </Link>
        ) : null}
      </form>

      <p aria-live="polite">
        {total} {total === 1 ? 'pedido' : 'pedidos'}
        {status ? ` en «${statusLabel(status)}»` : ''}
      </p>
      {rows.length === 0 ? (
        <p>{number ? 'Ningún pedido empieza por ese número.' : status ? 'No hay pedidos en este estado.' : 'Aún no hay pedidos.'}</p>
      ) : (
        <table className="orders orders--stack" role="table">
          <caption className="visually-hidden">Pedidos de la tienda</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Pedido</th>
              <th scope="col" role="columnheader">Fecha</th>
              <th scope="col" role="columnheader">Cliente</th>
              <th scope="col" role="columnheader">Entrega y pago</th>
              <th scope="col" role="columnheader">Total</th>
              <th scope="col" role="columnheader">Estado</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((o) => (
              <tr key={o.id} role="row">
                <td role="cell" data-label="Pedido">
                  <Link prefetch={false} href={`/admin/pedidos/${o.id}?volver=${back}`}>
                    {o.number}
                  </Link>
                </td>
                <td role="cell" data-label="Fecha">
                  <time dateTime={o.createdAt.toISOString()}>{formatDateTime(o.createdAt)}</time>
                </td>
                <td role="cell" data-label="Cliente">{o.customerName ?? 'Cliente eliminado'}</td>
                <td role="cell" data-label="Entrega y pago">
                  {o.shippingKind === 'clinic_pickup' ? 'Recogida' : 'Envío'} · {PAYMENT_METHOD_LABELS[o.paymentMethod]}
                </td>
                <td role="cell" data-label="Total">{formatEur(o.totalCents)}</td>
                <td role="cell" data-label="Estado">
                  <span className={statusBadgeClass(o.status)}>{statusLabel(o.status, o.refundStatus)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination current={Math.min(page, pages)} pages={pages} hrefFor={listQuery} />
    </>
  );
}
