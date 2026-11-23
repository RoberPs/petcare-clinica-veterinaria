import Link from 'next/link';
import { formatEur } from '@/domain/money';
import { statusLabel } from '@/domain/order-status';
import { formatDate } from '@/domain/time';
import type { OrderListItem } from '@/db/queries/orders';

interface Props {
  caption: string;
  orders: OrderListItem[];
}

// Tabla de pedidos (design/cuenta.html: table.orders): número, fecha, estado con texto y total.
// Los roles explícitos mantienen la semántica de tabla cuando, en móvil, las filas se apilan con CSS.
export function OrderTable({ caption, orders }: Props) {
  return (
    <table className="orders orders--stack" role="table">
      <caption className="visually-hidden">{caption}</caption>
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">Pedido</th>
          <th scope="col" role="columnheader">Fecha</th>
          <th scope="col" role="columnheader">Estado</th>
          <th scope="col" role="columnheader">Total</th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {orders.map((o) => (
          <tr key={o.id} role="row">
            <td role="cell" data-label="Pedido">
              <Link prefetch={false} href={`/mi-cuenta/pedidos/${encodeURIComponent(o.number)}`}>
                {o.number}
              </Link>
            </td>
            <td role="cell" data-label="Fecha">{formatDate(o.createdAt)}</td>
            <td role="cell" data-label="Estado">
              <span className="badge">{statusLabel(o.status, o.refundStatus)}</span>
            </td>
            <td role="cell" data-label="Total">{formatEur(o.totalCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
