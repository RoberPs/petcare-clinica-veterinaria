import { requireEnv } from '@/lib/env';
import { hmacHex, sign, verify } from '@/lib/signing';

// Referencia de la página de confirmación (B6): el id de la cita y la hora de la reserva, firmados.
// Caduca a las 2 h: después, la página dice que la cita está confirmada sin mostrar datos.

export const CONFIRMATION_REF_TTL_MS = 2 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function refKey(): string {
  return hmacHex('appointment-confirmation', requireEnv('FORM_SECRET'));
}

export function signConfirmationRef(appointmentId: string, now: Date): string {
  return sign(JSON.stringify({ a: appointmentId, t: now.getTime() }), refKey());
}

/** Id de la cita si la referencia es válida y no ha caducado; si no, null. */
export function verifyConfirmationRef(ref: string | null | undefined, now: Date): string | null {
  if (typeof ref !== 'string' || ref.length > 300) return null;
  const payload = verify(ref, refKey());
  if (!payload) return null;
  try {
    const { a, t } = JSON.parse(payload) as { a?: unknown; t?: unknown };
    if (typeof a !== 'string' || !UUID_RE.test(a) || typeof t !== 'number') return null;
    const age = now.getTime() - t;
    if (age < -60_000 || age > CONFIRMATION_REF_TTL_MS) return null;
    return a;
  } catch {
    return null;
  }
}
