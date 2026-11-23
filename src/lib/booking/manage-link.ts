import { requireEnv } from '@/lib/env';
import { hmacHex, sign, verify } from '@/lib/signing';

// Enlace de gestión de la clínica (B7): token sin estado, HMAC-SHA256 con una clave derivada de
// FORM_SECRET. Lleva el id de la cita y su manage_version: cada cambio o cancelación incrementa la
// versión, así que solo vale el enlace del último correo. Cambiar FORM_SECRET los invalida todos.

const PURPOSE = 'clinic';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function manageKey(): string {
  return hmacHex('appointment-manage', requireEnv('FORM_SECRET'));
}

export interface ManageTokenData {
  appointmentId: string;
  version: number;
}

export function signManageToken(data: ManageTokenData): string {
  return sign(JSON.stringify({ a: data.appointmentId, v: data.version, p: PURPOSE }), manageKey());
}

/** Datos del token si la firma es válida y el formato es el esperado; si no, null. */
export function verifyManageToken(token: string | null | undefined): ManageTokenData | null {
  if (typeof token !== 'string' || token.length > 400) return null;
  const payload = verify(token, manageKey());
  if (!payload) return null;
  try {
    const { a, v, p } = JSON.parse(payload) as { a?: unknown; v?: unknown; p?: unknown };
    if (
      p !== PURPOSE ||
      typeof a !== 'string' ||
      !UUID_RE.test(a) ||
      typeof v !== 'number' ||
      !Number.isInteger(v) ||
      v < 1
    ) {
      return null;
    }
    return { appointmentId: a, version: v };
  } catch {
    return null;
  }
}

/** Ruta del enlace de gestión (sin el dominio). */
export function managePath(data: ManageTokenData): string {
  return `/gestion-cita/${signManageToken(data)}`;
}
