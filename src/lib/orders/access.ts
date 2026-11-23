import { requireEnv } from '@/lib/env';
import { hmacHex, sign, verify } from '@/lib/signing';

// Acceso a un pedido sin sesión (D18):
// - ref de la confirmación y del pago no completado: id del pedido y hora, firmados; caduca a las 2 h (B6);
// - token del enlace privado de invitado: id y access_version, firmados con hmac(FORM_SECRET,
//   'order-access'). Sin caducidad propia: vale mientras last_status_at + guest_link_days no haya
//   pasado (lo comprueba la página contra la base) y la versión coincida.

export const ORDER_REF_TTL_MS = 2 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const refKey = () => hmacHex('order-ref', requireEnv('FORM_SECRET'));
const guestKey = () => hmacHex('order-access', requireEnv('FORM_SECRET'));

export function signOrderRef(orderId: string, now: Date): string {
  return sign(JSON.stringify({ o: orderId, t: now.getTime() }), refKey());
}

/** Id del pedido si la ref es válida y no ha caducado; si no, null. */
export function verifyOrderRef(ref: unknown, now: Date): string | null {
  if (typeof ref !== 'string' || ref.length > 300) return null;
  const payload = verify(ref, refKey());
  if (!payload) return null;
  try {
    const { o, t } = JSON.parse(payload) as { o?: unknown; t?: unknown };
    if (typeof o !== 'string' || !UUID_RE.test(o) || typeof t !== 'number') return null;
    const age = now.getTime() - t;
    return age < -60_000 || age > ORDER_REF_TTL_MS ? null : o;
  } catch {
    return null;
  }
}

export function signGuestToken(input: { orderId: string; version: number }): string {
  return sign(JSON.stringify({ o: input.orderId, v: input.version }), guestKey());
}

/** { orderId, version } si la firma es válida; la caducidad y la versión las comprueba quien lo usa. */
export function verifyGuestToken(token: unknown): { orderId: string; version: number } | null {
  if (typeof token !== 'string' || token.length > 300) return null;
  const payload = verify(token, guestKey());
  if (!payload) return null;
  try {
    const { o, v } = JSON.parse(payload) as { o?: unknown; v?: unknown };
    if (typeof o !== 'string' || !UUID_RE.test(o) || typeof v !== 'number' || !Number.isInteger(v)) return null;
    return { orderId: o, version: v };
  } catch {
    return null;
  }
}

/** ¿Sigue vigente el enlace de invitado? Caduca a los guest_link_days desde el último cambio de estado. */
export function guestLinkValid(lastStatusAt: Date, guestLinkDays: number, now: Date): boolean {
  return now.getTime() < lastStatusAt.getTime() + guestLinkDays * 24 * 60 * 60 * 1000;
}

/** Ruta privada del pedido: el área del cliente o el enlace firmado de invitado. */
export function orderPath(order: { id: string; number: string; customerId: string | null; accessVersion: number }): string {
  return order.customerId
    ? `/mi-cuenta/pedidos/${encodeURIComponent(order.number)}`
    : `/pedido/${signGuestToken({ orderId: order.id, version: order.accessVersion })}`;
}
