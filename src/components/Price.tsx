import { onSale } from '@/domain/catalog';
import { formatEur, priceLabel } from '@/domain/money';

// Precio con IVA incluido en formato "1.234,56 €". En oferta, el precio anterior va tachado y el
// lector de pantalla oye "Antes X, ahora Y" (FR-016); un compareAt no mayor que el precio se ignora.
export function Price({ priceCents, compareAtCents = null }: { priceCents: number; compareAtCents?: number | null }) {
  if (!onSale(priceCents, compareAtCents)) return <span className="price">{formatEur(priceCents)}</span>;
  return (
    <span className="price">
      <s aria-hidden="true">{formatEur(compareAtCents!)}</s>
      <span aria-hidden="true">{formatEur(priceCents)}</span>
      <span className="visually-hidden">{priceLabel(priceCents, compareAtCents!)}</span>
    </span>
  );
}

/** Etiquetas "Novedad" y "Oferta" (texto, no solo color). Nada si no hay ninguna. */
export function ProductTags({ isNew, priceCents, compareAtCents }: { isNew: boolean; priceCents: number; compareAtCents: number | null }) {
  const sale = onSale(priceCents, compareAtCents);
  if (!isNew && !sale) return null;
  return (
    <span className="product__tags">
      {isNew ? <span className="chip chip--amber">Novedad</span> : null}
      {sale ? <span className="chip">Oferta</span> : null}
    </span>
  );
}
