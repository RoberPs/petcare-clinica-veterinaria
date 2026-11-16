// Reglas puras del carrito: cantidades (FR-005) y huella del checkout (D10, FR-012).

export interface QuantityLimits {
  stock: number;
  maxPerLine: number;
}

export type ClampResult =
  | { kind: 'ok'; quantity: number; adjusted: null | 'stock' | 'max' }
  | { kind: 'remove' }
  | { kind: 'out_of_stock' }
  | { kind: 'invalid' };

/** Interpreta la cantidad enviada (texto del formulario o número) y la acota a stock y máximo. */
export function clampQuantity(raw: unknown, limits: QuantityLimits): ClampResult {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{1,4}$/.test(text)) return { kind: 'invalid' };
  const wanted = Number(text);
  if (wanted === 0) return { kind: 'remove' };
  if (limits.stock <= 0) return { kind: 'out_of_stock' };
  const max = Math.min(limits.stock, limits.maxPerLine);
  if (wanted <= max) return { kind: 'ok', quantity: wanted, adjusted: null };
  return { kind: 'ok', quantity: max, adjusted: limits.stock <= limits.maxPerLine ? 'stock' : 'max' };
}

export interface FingerprintInput {
  lines: readonly { productId: string; quantity: number }[];
  shippingMethod: string;
  discountCode?: string | null;
}

/**
 * Cadena canónica de lo que se compra: líneas ordenadas por producto, método de envío y código.
 * El SHA-256 se calcula en src/lib/ (aquí no hay node:crypto).
 */
export function checkoutFingerprint(input: FingerprintInput): string {
  const lines = [...input.lines]
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))
    .map((l) => `${l.productId}*${l.quantity}`)
    .join(',');
  return `${lines}|${input.shippingMethod}|${input.discountCode ?? ''}`;
}
