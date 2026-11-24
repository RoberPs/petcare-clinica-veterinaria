// Tipos de IVA admitidos en España para los productos y el envío (feature 008, T007).
// Es la única lista: la usan los CHECK de la base de datos, los esquemas Zod y el formulario.

export const VAT_RATES = [0, 4, 10, 21] as const;

export type VatRate = (typeof VAT_RATES)[number];

export function isVatRate(value: number): value is VatRate {
  return (VAT_RATES as readonly number[]).includes(value);
}
