// Envío y zonas (D13): código postal español y zona por prefijo de provincia (01–52).

const POSTAL_CODE = /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/;
export const POSTAL_PREFIX = /^(0[1-9]|[1-4]\d|5[0-2])$/;

export function isSpanishPostalCode(value: string): boolean {
  return POSTAL_CODE.test(value);
}

/** Prefijos nulos = toda España. */
export function inZone(postalCode: string, prefixes: readonly string[] | null): boolean {
  if (!isSpanishPostalCode(postalCode)) return false;
  return prefixes === null || prefixes.includes(postalCode.slice(0, 2));
}
