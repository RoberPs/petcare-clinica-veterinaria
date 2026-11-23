import { describe, expect, it } from 'vitest';
import { discountMessage, normalizeCode, validateDiscount, type DiscountCodeData } from '@/domain/discount';
import { formatEur } from '@/domain/money';

const now = new Date('2026-11-12T10:00:00Z');
const base: DiscountCodeData = {
  code: 'PETCARE5',
  kind: 'fixed',
  value: 500,
  minSubtotalCents: null,
  startsAt: null,
  endsAt: null,
  maxUses: null,
  usesCount: 0,
  enabled: true,
};

describe('normalizeCode', () => {
  it('quita espacios y pasa a mayúsculas', () => {
    expect(normalizeCode('  bienvenida10 ')).toBe('BIENVENIDA10');
    expect(normalizeCode('pet care 5')).toBe('PETCARE5');
  });

  it('null si no tiene el formato', () => {
    expect(normalizeCode('ab')).toBeNull();
    expect(normalizeCode('código!')).toBeNull();
    expect(normalizeCode('A'.repeat(21))).toBeNull();
  });
});

describe('validateDiscount', () => {
  it('válido', () => {
    expect(validateDiscount(base, 1000, now)).toEqual({ ok: true });
  });

  it('not_found: inexistente o inactivo', () => {
    expect(validateDiscount(null, 1000, now)).toEqual({ ok: false, reason: 'not_found' });
    expect(validateDiscount({ ...base, enabled: false }, 1000, now)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('not_started y expired', () => {
    expect(validateDiscount({ ...base, startsAt: new Date('2026-12-01T00:00:00Z') }, 1000, now)).toEqual({
      ok: false,
      reason: 'not_started',
    });
    expect(validateDiscount({ ...base, endsAt: now }, 1000, now)).toEqual({ ok: false, reason: 'expired' });
    expect(validateDiscount({ ...base, endsAt: new Date(now.getTime() + 1) }, 1000, now)).toEqual({ ok: true });
  });

  it('exhausted', () => {
    expect(validateDiscount({ ...base, maxUses: 3, usesCount: 3 }, 1000, now)).toEqual({ ok: false, reason: 'exhausted' });
    expect(validateDiscount({ ...base, maxUses: 3, usesCount: 2 }, 1000, now)).toEqual({ ok: true });
  });

  it('min_subtotal', () => {
    expect(validateDiscount({ ...base, minSubtotalCents: 3000 }, 2999, now)).toEqual({ ok: false, reason: 'min_subtotal' });
    expect(validateDiscount({ ...base, minSubtotalCents: 3000 }, 3000, now)).toEqual({ ok: true });
  });
});

describe('discountMessage', () => {
  it('mensajes en español sin revelar códigos', () => {
    expect(discountMessage('not_found', null)).toBe('Este código no existe o ya no está activo.');
    expect(discountMessage('expired', base)).toBe('Este código ha caducado.');
    expect(discountMessage('not_started', base)).toBe('Este código todavía no está activo.');
    expect(discountMessage('exhausted', base)).toBe('Este código ya no tiene usos disponibles.');
    expect(discountMessage('min_subtotal', { ...base, minSubtotalCents: 3000 })).toBe(
      `Este código requiere un pedido mínimo de ${formatEur(3000)}`,
    );
    for (const reason of ['not_found', 'expired', 'exhausted'] as const) {
      expect(discountMessage(reason, base)).not.toContain('PETCARE5');
    }
  });
});
