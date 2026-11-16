// Importes del carrito y del pedido (D5). Todo en céntimos enteros con IVA incluido (C2).
// Es la ÚNICA función que suma importes: carrito, checkout, pedido, correos y pasarela usan
// cartTotals() o la copia que guarda el pedido (SC-005).

export interface PriceLine {
  unitPriceCents: number;
  quantity: number;
  vatRate: number;
  /** Línea no disponible (despublicada o agotada): se muestra, pero queda fuera del total. */
  unavailable?: boolean;
}

export interface DiscountRule {
  kind: 'percent' | 'fixed';
  /** Porcentaje (1–100) o céntimos. */
  value: number;
}

export interface ShippingCost {
  costCents: number;
  vatRate: number;
}

export interface LineTotals {
  /** Unitario × cantidad (0 si la línea no está disponible). */
  grossCents: number;
  discountShareCents: number;
  /** Bruto menos su parte del descuento. */
  netCents: number;
  vatCents: number;
}

export interface CartTotals {
  lines: LineTotals[];
  /** Unidades de las líneas disponibles. */
  units: number;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  /** IVA contenido total (líneas + envío). */
  vatCents: number;
}

/** Redondeo de a/b con la mitad hacia arriba, para enteros no negativos y b > 0. */
function roundDiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

/** IVA contenido en un importe con IVA: neto − round(neto / (1 + tipo)). */
export function vatIncluded(amountCents: number, vatRate: number): number {
  if (amountCents <= 0 || vatRate <= 0) return 0;
  return amountCents - roundDiv(amountCents * 100, 100 + vatRate);
}

/** Descuento sobre el subtotal de productos: porcentaje redondeado o importe fijo con tope. */
export function discountAmount(subtotalCents: number, discount: DiscountRule | null): number {
  if (!discount || subtotalCents <= 0) return 0;
  if (discount.kind === 'percent') return Math.min(subtotalCents, roundDiv(subtotalCents * discount.value, 100));
  return Math.min(subtotalCents, discount.value);
}

/**
 * Reparte el descuento entre las líneas en proporción a su importe (método del mayor resto). La
 * suma de las partes es exactamente el descuento; los empates de resto van a la primera línea.
 */
export function splitDiscount(amounts: readonly number[], discountCents: number): number[] {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (total <= 0 || discountCents <= 0) return amounts.map(() => 0);
  const d = Math.min(discountCents, total);
  const shares = amounts.map((a) => Math.floor((d * a) / total));
  let left = d - shares.reduce((a, b) => a + b, 0);
  const order = amounts
    .map((a, i) => ({ i, rest: (d * a) % total }))
    .sort((x, y) => y.rest - x.rest || x.i - y.i);
  for (const { i } of order) {
    if (left === 0) break;
    if (shares[i]! < amounts[i]!) {
      shares[i]! += 1;
      left -= 1;
    }
  }
  return shares;
}

export function cartTotals(lines: readonly PriceLine[], discount: DiscountRule | null, shipping: ShippingCost): CartTotals {
  const gross = lines.map((l) => (l.unavailable ? 0 : l.unitPriceCents * l.quantity));
  const subtotalCents = gross.reduce((a, b) => a + b, 0);
  const discountCents = discountAmount(subtotalCents, discount);
  const shares = splitDiscount(gross, discountCents);
  const lineTotals = lines.map((l, i): LineTotals => {
    const netCents = gross[i]! - shares[i]!;
    return { grossCents: gross[i]!, discountShareCents: shares[i]!, netCents, vatCents: vatIncluded(netCents, l.vatRate) };
  });
  const shippingCents = Math.max(0, shipping.costCents);
  const vatCents = lineTotals.reduce((a, l) => a + l.vatCents, 0) + vatIncluded(shippingCents, shipping.vatRate);
  return {
    lines: lineTotals,
    units: lines.reduce((a, l) => a + (l.unavailable ? 0 : l.quantity), 0),
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents: subtotalCents - discountCents + shippingCents,
    vatCents,
  };
}
