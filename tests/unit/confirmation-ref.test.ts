import { describe, expect, it } from 'vitest';
import { CONFIRMATION_REF_TTL_MS, signConfirmationRef, verifyConfirmationRef } from '@/lib/booking/confirmation-ref';
import { signManageToken } from '@/lib/booking/manage-link';

const A = '6f1c2a40-1b2c-4d3e-8f90-123456789abc';
const NOW = new Date('2026-11-16T09:00:00Z');

describe('referencia de confirmación (B6)', () => {
  it('vale durante 2 h', () => {
    const ref = signConfirmationRef(A, NOW);
    expect(verifyConfirmationRef(ref, NOW)).toBe(A);
    expect(verifyConfirmationRef(ref, new Date(NOW.getTime() + CONFIRMATION_REF_TTL_MS))).toBe(A);
    expect(verifyConfirmationRef(ref, new Date(NOW.getTime() + CONFIRMATION_REF_TTL_MS + 1))).toBeNull();
  });

  it('una referencia manipulada o de otro tipo no vale', () => {
    const ref = signConfirmationRef(A, NOW);
    expect(verifyConfirmationRef(`${ref}x`, NOW)).toBeNull();
    expect(verifyConfirmationRef(signManageToken({ appointmentId: A, version: 1 }), NOW)).toBeNull();
    expect(verifyConfirmationRef(undefined, NOW)).toBeNull();
  });
});
