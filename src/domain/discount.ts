import { formatEur } from './money';

// Códigos de descuento (D12): normalización, validación con el motivo exacto y mensajes. Los
// mensajes nunca sugieren ni revelan códigos válidos.

export const DISCOUNT_CODE_RE = /^[A-Z0-9]{3,20}$/;

export interface DiscountCodeData {
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  minSubtotalCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  usesCount: number;
  enabled: boolean;
}

export type DiscountRejection = 'not_found' | 'not_started' | 'expired' | 'exhausted' | 'min_subtotal';

/** "  bienvenida 10 " → "BIENVENIDA10"; null si no tiene el formato de un código. */
export function normalizeCode(raw: string): string | null {
  const code = raw.replace(/\s+/g, '').toUpperCase();
  return DISCOUNT_CODE_RE.test(code) ? code : null;
}

export function validateDiscount(
  code: DiscountCodeData | null,
  subtotalCents: number,
  now: Date,
): { ok: true } | { ok: false; reason: DiscountRejection } {
  if (!code || !code.enabled) return { ok: false, reason: 'not_found' };
  if (code.startsAt && now.getTime() < code.startsAt.getTime()) return { ok: false, reason: 'not_started' };
  if (code.endsAt && now.getTime() >= code.endsAt.getTime()) return { ok: false, reason: 'expired' };
  if (code.maxUses !== null && code.usesCount >= code.maxUses) return { ok: false, reason: 'exhausted' };
  if (code.minSubtotalCents !== null && subtotalCents < code.minSubtotalCents) return { ok: false, reason: 'min_subtotal' };
  return { ok: true };
}

export function discountMessage(reason: DiscountRejection, code: Pick<DiscountCodeData, 'minSubtotalCents'> | null): string {
  switch (reason) {
    case 'not_found':
      return 'Este código no existe o ya no está activo.';
    case 'not_started':
      return 'Este código todavía no está activo.';
    case 'expired':
      return 'Este código ha caducado.';
    case 'exhausted':
      return 'Este código ya no tiene usos disponibles.';
    case 'min_subtotal':
      return `Este código requiere un pedido mínimo de ${formatEur(code?.minSubtotalCents ?? 0)}`;
  }
}
