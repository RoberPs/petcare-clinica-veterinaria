import type { ReactNode } from 'react';
import type { AdminOrderDetail, AdminOrderHistoryEntry } from '@/db/queries/admin-orders';
import { formatEur } from '@/domain/money';
import { PAYMENT_METHOD_LABELS, statusLabel, type OrderActor } from '@/domain/order-status';
import { formatDateTime } from '@/domain/time';
import { statusBadgeClass } from './OrderFilters';

// Detalle de un pedido en el panel (US2, escenario 3; G17): líneas, totales e IVA, contacto y
// entrega, pago y reembolso, e historial con su autor. Los datos de contacto solo se ven aquí
// (página privada, sin caché). Las acciones (US3) llegan como `children`.

const ACTOR_LABEL: Record<OrderActor, string> = {
  customer: 'Comprador',
  system: 'Sistema',
  gateway: 'Pasarela de pago',
  clinic: 'Clínica',
};

const REFUND_LABEL = {
  none: null,
  pending: 'Reembolso en trámite',
  refunded: 'Reembolsado',
  failed: 'El reembolso ha fallado',
} as const;

/** Autor visible de un cambio (G9): el administrador del panel, la CLI o el actor. */
export function historyAuthor(h: Pick<AdminOrderHistoryEntry, 'actor' | 'adminName'>): string {
  if (h.actor === 'clinic') return h.adminName ?? 'Clínica (CLI)';
  return ACTOR_LABEL[h.actor];
}

const iso = (d: Date) => d.toISOString();

export function OrderDetail({ detail, children }: { detail: AdminOrderDetail; children?: ReactNode }) {
  const { order, items, history, payment } = detail;
  const pickup = order.shippingKind === 'clinic_pickup';
  const anonymized = order.anonymizedAt !== null;
  const refund = REFUND_LABEL[order.refundStatus];
  return (
    <>
      <div className="admin-heading">
        <h2>Pedido {order.number}</h2>
        <span className={statusBadgeClass(order.status)}>{statusLabel(order.status, order.refundStatus)}</span>
      </div>
      <p>
        Hecho el <time dateTime={iso(order.createdAt)}>{formatDateTime(order.createdAt)}</time>.
      </p>

      {children}

      <section className="panel admin-section" aria-labelledby="pedido-lineas">
        <h3 id="pedido-lineas">Productos</h3>
        <table className="orders orders--stack" role="table">
          <caption className="visually-hidden">Líneas del pedido</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Producto</th>
              <th scope="col" role="columnheader">Precio unitario</th>
              <th scope="col" role="columnheader">Cantidad</th>
              <th scope="col" role="columnheader">IVA</th>
              <th scope="col" role="columnheader">Importe</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {items.map((i) => (
              <tr key={i.id} role="row">
                <td role="cell" data-label="Producto">{i.productName}</td>
                <td role="cell" data-label="Precio unitario">{formatEur(i.unitPriceCents)}</td>
                <td role="cell" data-label="Cantidad">{i.quantity}</td>
                <td role="cell" data-label="IVA">{i.vatRate} %</td>
                <td role="cell" data-label="Importe">{formatEur(i.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="admin-dl">
          <dt>Subtotal</dt>
          <dd>{formatEur(order.subtotalCents)}</dd>
          {order.discountCents > 0 ? (
            <>
              <dt>Descuento{order.discountCode ? ` (${order.discountCode})` : ''}</dt>
              <dd>−{formatEur(order.discountCents)}</dd>
            </>
          ) : null}
          <dt>Envío ({order.shippingName})</dt>
          <dd>{order.shippingCostCents > 0 ? formatEur(order.shippingCostCents) : 'Gratis'}</dd>
          <dt>Total</dt>
          <dd>
            <strong>{formatEur(order.totalCents)}</strong>
          </dd>
          <dt>IVA incluido</dt>
          <dd>{formatEur(order.vatCents)}</dd>
        </dl>
      </section>

      <section className="panel admin-section" aria-labelledby="pedido-cliente">
        <h3 id="pedido-cliente">Comprador y entrega</h3>
        {anonymized ? (
          <p>Cliente eliminado: los datos de contacto se borraron al eliminar la cuenta.</p>
        ) : (
          <dl className="admin-dl">
            <dt>Nombre</dt>
            <dd>
              {order.firstName} {order.lastName}
            </dd>
            <dt>Correo</dt>
            <dd>{order.contactEmail}</dd>
            <dt>Cuenta</dt>
            <dd>{order.customerId ? 'Cliente con cuenta' : 'Invitado'}</dd>
          </dl>
        )}
        <dl className="admin-dl">
          <dt>Entrega</dt>
          <dd>{order.shippingName}</dd>
          {!pickup && !anonymized && order.addressLine ? (
            <>
              <dt>Dirección</dt>
              <dd>
                {order.addressLine}, {order.postalCode} {order.city}
              </dd>
            </>
          ) : null}
          {pickup && order.pickupDeadline && order.status === 'pending_payment' ? (
            <>
              <dt>Plazo de recogida</dt>
              <dd>
                <time dateTime={iso(order.pickupDeadline)}>{formatDateTime(order.pickupDeadline)}</time>
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="panel admin-section" aria-labelledby="pedido-pago">
        <h3 id="pedido-pago">Pago</h3>
        <dl className="admin-dl">
          <dt>Forma de pago</dt>
          <dd>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</dd>
          <dt>Pagado</dt>
          <dd>{order.paidAt ? <time dateTime={iso(order.paidAt)}>{formatDateTime(order.paidAt)}</time> : 'No'}</dd>
          {payment ? (
            <>
              <dt>Pasarela</dt>
              <dd>{payment.provider === 'fake' ? 'Pasarela simulada (pruebas)' : 'Stripe (modo de pruebas)'}</dd>
            </>
          ) : null}
          {refund ? (
            <>
              <dt>Reembolso</dt>
              <dd>
                {refund}
                {order.refundedAt ? (
                  <>
                    {' '}
                    el <time dateTime={iso(order.refundedAt)}>{formatDateTime(order.refundedAt)}</time>
                  </>
                ) : null}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="panel admin-section" aria-labelledby="pedido-historial">
        <h3 id="pedido-historial">Historial</h3>
        <ol className="admin-history">
          {history.map((h) => (
            <li key={h.id}>
              <time dateTime={iso(h.createdAt)}>{formatDateTime(h.createdAt)}</time>: {h.fromStatus ? `${statusLabel(h.fromStatus)} → ` : ''}
              {statusLabel(h.toStatus)} · {historyAuthor(h)}
              {h.note ? <span className="field__hint"> ({h.note})</span> : null}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
