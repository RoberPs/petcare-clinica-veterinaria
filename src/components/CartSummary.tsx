import { formatEur } from '@/domain/money';

export interface SummaryFigures {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  vatCents: number;
}

interface Props {
  title?: string;
  /** Cifras de cartTotals() o de la copia guardada en el pedido (SC-005): aquí no se suma nada. */
  figures: SummaryFigures;
  discountCode?: string | null;
  /** Nombre del envío (en el pedido) o null para mostrar solo "Envío". */
  shippingLabel?: string | null;
  headingLevel?: 2 | 3;
  children?: React.ReactNode;
}

// Resumen de importes (.summary) del carrito, el checkout y el pedido. Las cifras van en una región
// aria-live para que se anuncien los cambios tras actualizar el carrito.
export function CartSummary({ title = 'Resumen del pedido', figures, discountCode, shippingLabel, headingLevel = 2, children }: Props) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <aside className="summary" aria-label={title}>
      <Heading>{title}</Heading>
      <div aria-live="polite" aria-atomic="true">
        <div className="summary__row">
          <span>Subtotal</span>
          <span>{formatEur(figures.subtotalCents)}</span>
        </div>
        {figures.discountCents > 0 ? (
          <div className="summary__row summary__row--discount">
            <span>Descuento{discountCode ? ` (${discountCode})` : ''}</span>
            <span>−{formatEur(figures.discountCents)}</span>
          </div>
        ) : null}
        <div className="summary__row">
          <span>{shippingLabel ? `Envío: ${shippingLabel}` : 'Envío'}</span>
          <span>{figures.shippingCents === 0 ? 'Gratis' : formatEur(figures.shippingCents)}</span>
        </div>
        <div className="summary__row summary__row--total">
          <span>Total</span>
          <span>{formatEur(figures.totalCents)}</span>
        </div>
        <p className="summary__note">IVA incluido: {formatEur(figures.vatCents)}</p>
      </div>
      {children}
    </aside>
  );
}
