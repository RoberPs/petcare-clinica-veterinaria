import { formatEur } from '@/domain/money';
import { PAYMENT_METHOD_LABELS, statusLabel } from '@/domain/order-status';
import { formatDateTime, formatLongDate, zonedNow } from '@/domain/time';
import type { OrderItemRow, OrderRow } from '@/db/queries/orders';
import { CartSummary } from './CartSummary';

export interface OrderHistoryEntry {
  toStatus: OrderRow['status'];
  createdAt: Date;
}

interface Props {
  order: OrderRow;
  items: OrderItemRow[];
  history?: OrderHistoryEntry[];
  /** Dirección y horario de la clínica (recogida), leídos de la base. */
  clinic: { address: string; hours: string[] };
  headingLevel?: 2 | 3;
}

const dayOf = (date: Date) => formatLongDate(zonedNow(date).toPlainDate().toString());

// Detalle de un pedido (confirmación, enlace de invitado y "Mis pedidos"). Todas las cifras salen de
// la copia guardada en el pedido (SC-005); el estado va con texto, no solo con color.
export function OrderDetail({ order, items, history = [], clinic, headingLevel = 2 }: Props) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const pickup = order.shippingKind === 'clinic_pickup';
  return (
    <div className="cart-layout">
      <div>
        <section className="panel" aria-labelledby={`productos-${order.id}`}>
          <H id={`productos-${order.id}`}>Productos</H>
          <ul className="order-lines">
            {items.map((i) => (
              <li key={i.id}>
                <span>
                  {i.productName} × {i.quantity}
                </span>
                <span>{formatEur(i.unitPriceCents * i.quantity)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel" aria-labelledby={`entrega-${order.id}`}>
          <H id={`entrega-${order.id}`}>{pickup ? 'Recogida' : 'Envío'}</H>
          <p>
            <strong>{order.shippingName}</strong>
          </p>
          {pickup ? (
            <>
              <p>{clinic.address}</p>
              {clinic.hours.length > 0 ? (
                <ul className="footer__list" aria-label="Horario de la clínica">
                  {clinic.hours.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              ) : null}
              {order.pickupDeadline && order.status === 'pending_payment' ? (
                <p>Recógelo antes del {dayOf(new Date(order.pickupDeadline.getTime() - 1))} (incluido).</p>
              ) : null}
            </>
          ) : order.addressLine ? (
            <p>
              {order.firstName} {order.lastName}
              <br />
              {order.addressLine}
              <br />
              {order.postalCode} {order.city}
            </p>
          ) : null}
        </section>
        <section className="panel" aria-labelledby={`pago-${order.id}`}>
          <H id={`pago-${order.id}`}>Pago y estado</H>
          <p>
            Pago:{' '}
            {order.paymentMethod === 'in_clinic' && order.status === 'pending_payment'
              ? 'Pago en la clínica (pendiente)'
              : PAYMENT_METHOD_LABELS[order.paymentMethod]}
          </p>
          <p className="order-status">Estado: {statusLabel(order.status, order.refundStatus)}</p>
          {order.refundStatus === 'pending' ? <p>Estamos tramitando la devolución del importe.</p> : null}
          {history.length > 0 ? (
            <>
              <H>Historial</H>
              <ol className="order-history">
                {history.map((h, i) => (
                  <li key={i}>
                    {formatDateTime(h.createdAt)}: {statusLabel(h.toStatus)}
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </section>
      </div>
      <CartSummary
        title={`Pedido ${order.number}`}
        headingLevel={headingLevel}
        discountCode={order.discountCode}
        shippingLabel={order.shippingName}
        figures={{
          subtotalCents: order.subtotalCents,
          discountCents: order.discountCents,
          shippingCents: order.shippingCostCents,
          totalCents: order.totalCents,
          vatCents: order.vatCents,
        }}
      >
        <p className="summary__note">Fecha: {formatDateTime(order.createdAt)}</p>
      </CartSummary>
    </div>
  );
}
