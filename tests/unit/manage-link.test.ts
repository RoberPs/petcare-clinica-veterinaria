import { describe, expect, it } from 'vitest';
import { signConfirmationRef } from '@/lib/booking/confirmation-ref';
import { managePath, signManageToken, verifyManageToken } from '@/lib/booking/manage-link';
import { sign } from '@/lib/signing';

const A = '6f1c2a40-1b2c-4d3e-8f90-123456789abc';
const B = '7a2d3b51-2c3d-4e4f-9a01-23456789abcd';

describe('enlace de gestión (B7)', () => {
  it('firma y verifica la cita y su versión', () => {
    const token = signManageToken({ appointmentId: A, version: 3 });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyManageToken(token)).toEqual({ appointmentId: A, version: 3 });
    expect(managePath({ appointmentId: A, version: 3 })).toBe(`/gestion-cita/${token}`);
  });

  it('otra cita u otra versión dan otro token', () => {
    const t = signManageToken({ appointmentId: A, version: 1 });
    expect(signManageToken({ appointmentId: B, version: 1 })).not.toBe(t);
    expect(signManageToken({ appointmentId: A, version: 2 })).not.toBe(t);
  });

  it('un token manipulado no vale', () => {
    const t = signManageToken({ appointmentId: A, version: 1 });
    const [body, mac] = t.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ a: B, v: 1, p: 'clinic' })).toString('base64url');
    expect(verifyManageToken(`${forged}.${mac}`)).toBeNull();
    expect(verifyManageToken(`${body}.${mac.slice(0, -2)}AA`)).toBeNull();
    expect(verifyManageToken('')).toBeNull();
    expect(verifyManageToken('x'.repeat(500))).toBeNull();
  });

  it('no acepta tokens firmados con FORM_SECRET directamente ni otras referencias', () => {
    expect(verifyManageToken(sign(JSON.stringify({ a: A, v: 1, p: 'clinic' })))).toBeNull();
    expect(verifyManageToken(signConfirmationRef(A, new Date()))).toBeNull();
  });
});
