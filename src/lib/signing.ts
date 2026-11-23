import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireEnv } from './env';

// Firma HMAC-SHA256 con FORM_SECRET. Formato del token: base64url(payload) + "." + base64url(firma).

function hmac(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function sign(payload: string, secret: string = requireEnv('FORM_SECRET')): string {
  const body = Buffer.from(payload, 'utf8').toString('base64url');
  return `${body}.${hmac(body, secret).toString('base64url')}`;
}

/** Devuelve el payload si la firma es válida; si no, null. La comparación es en tiempo constante. */
export function verify(token: string | null | undefined, secret: string = requireEnv('FORM_SECRET')): string | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = hmac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return Buffer.from(body, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/** HMAC en hexadecimal, para claves que no deben guardarse en claro (por ejemplo, la IP). */
export function hmacHex(data: string, secret: string = requireEnv('FORM_SECRET')): string {
  return hmac(data, secret).toString('hex');
}
