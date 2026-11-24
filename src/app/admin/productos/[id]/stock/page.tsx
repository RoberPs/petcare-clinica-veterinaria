import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { StockAdjust } from '@/components/admin/StockAdjust';
import { getProductAdmin, listStockMovements } from '@/db/queries/admin-products';
import { STOCK_REASON_LABELS, uuid } from '@/domain/store-schemas';
import { formatDateTime } from '@/domain/time';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { adjustStock } from '../../actions';

export const metadata: Metadata = { title: 'Stock del producto' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const signed = (n: number) => (n > 0 ? `+${n}` : n === 0 ? '0' : `−${Math.abs(n)}`);

// Stock de un producto (US4): disponible y reservado, ajuste manual con motivo e historial de los
// últimos 50 movimientos (ajustes, pedidos y cargas de contenido).
export default async function AdminProductStockPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  const [{ id }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  if (!uuid.safeParse(id).success) notFound();
  const product = await getProductAdmin(id);
  if (!product) notFound();
  const movements = await listStockMovements(id, 50);
  return (
    <>
      <p>
        <Link prefetch={false} href={`/admin/productos/${id}`}>
          Volver al producto
        </Link>
      </p>
      <h2>Stock: {product.name}</h2>
      <AdminNotice searchParams={sp} context="product" />
      <dl className="stock-summary">
        <div>
          <dt>Disponible</dt>
          <dd>{product.stock}</dd>
        </div>
        <div>
          <dt>Reservado en pedidos pendientes</dt>
          <dd>{product.reserved}</dd>
        </div>
      </dl>
      <StockAdjust action={adjustStock} submissionToken={createSubmissionToken(now)} productId={id} />

      <section className="admin-section" aria-labelledby="movimientos">
        <h3 id="movimientos">Historial de movimientos</h3>
        {movements.length === 0 ? (
          <p>Aún no hay movimientos.</p>
        ) : (
          <table className="orders orders--stack stock-history" role="table">
            <caption className="visually-hidden">
              {movements.length === 1 ? 'Último movimiento de stock' : `Últimos ${movements.length} movimientos de stock`}
            </caption>
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">Fecha</th>
                <th scope="col" role="columnheader">Cambio</th>
                <th scope="col" role="columnheader">Motivo</th>
                <th scope="col" role="columnheader">Disponible después</th>
                <th scope="col" role="columnheader">Autor y nota</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {movements.map((m) => (
                <tr key={m.id} role="row">
                  <td role="cell" data-label="Fecha">
                    <time dateTime={m.createdAt.toISOString()}>{formatDateTime(m.createdAt)}</time>
                  </td>
                  <td role="cell" data-label="Cambio" className="stock-history__delta">
                    {signed(m.delta)}
                  </td>
                  <td role="cell" data-label="Motivo">
                    {STOCK_REASON_LABELS[m.reason]}
                    {m.orderId && m.orderNumber ? (
                      <>
                        {' '}
                        (
                        <Link prefetch={false} href={`/admin/pedidos/${m.orderId}`}>
                          {m.orderNumber}
                        </Link>
                        )
                      </>
                    ) : null}
                  </td>
                  <td role="cell" data-label="Disponible después">{m.stockAfter}</td>
                  <td role="cell" data-label="Autor y nota">
                    {[m.adminName, m.note].filter(Boolean).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
