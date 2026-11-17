import { createHash, randomBytes } from 'node:crypto';
import { requireEnv } from '@/lib/env';
import { hmacHex, sign, verify } from '@/lib/signing';

// Tokens del boletín (E8 y E10).
// - Confirmación: 32 bytes aleatorios en base64url; en la base de datos solo se guarda su SHA-256.
// - Baja: firma HMAC sin estado del id de la suscripción, con una clave derivada de FORM_SECRET
//   (propósito "newsletter-unsubscribe"). Volver a suscribirse crea otro id, así que un enlace
//   antiguo deja de valer.

export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_MAX_LEN = 400;
const PURPOSE = 'newsletter-unsubscribe';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function hashConfirmToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface ConfirmToken {
  token: string;
  hash: string;
  expiresAt: Date;
}

export function newConfirmToken(now: Date): ConfirmToken {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashConfirmToken(token), expiresAt: new Date(now.getTime() + CONFIRM_TTL_MS) };
}

/** Hash del token recibido si tiene la forma esperada; si no, null (sin consultar la base de datos). */
export function confirmTokenHash(token: unknown): string | null {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return hashConfirmToken(token);
}

function unsubscribeKey(): string {
  return hmacHex(PURPOSE, requireEnv('FORM_SECRET'));
}

export function unsubscribeToken(subscriptionId: string): string {
  return sign(JSON.stringify({ s: subscriptionId, p: PURPOSE }), unsubscribeKey());
}

/** Id de la suscripción si la firma es válida; si no, null. */
export function verifyUnsubscribeToken(token: unknown): string | null {
  if (typeof token !== 'string' || token.length > TOKEN_MAX_LEN) return null;
  const payload = verify(token, unsubscribeKey());
  if (!payload) return null;
  try {
    const { s, p } = JSON.parse(payload) as { s?: unknown; p?: unknown };
    return p === PURPOSE && typeof s === 'string' && UUID_RE.test(s) ? s : null;
  } catch {
    return null;
  }
}
