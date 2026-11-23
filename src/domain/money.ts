// Dinero en céntimos enteros con IVA incluido (C2). Formato propio "1.234,56 €" (C3): Intl con
// es-ES no agrupa los miles en números de cuatro cifras.

const NBSP = ' ';
const EUROS = /^\d{1,5}(\.\d{1,2})?$/;

export function formatEur(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const euros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = (abs % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rest}${NBSP}€`;
}

/** "39.90" → 3990. Devuelve null si el formato no es válido o el importe no es positivo. */
export function parseEuros(text: string): number | null {
  if (!EUROS.test(text)) return null;
  const [whole, decimals = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

/** Texto accesible de una oferta: "Antes 12,00 €, ahora 9,90 €". */
export function priceLabel(priceCents: number, compareAtCents: number): string {
  return `Antes ${formatEur(compareAtCents)}, ahora ${formatEur(priceCents)}`;
}
