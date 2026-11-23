import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cookieIsSecure } from '@/lib/auth/session';

// Cookie técnica del carrito de invitado (D3): 32 bytes aleatorios en base64url. La base de datos
// solo guarda su SHA-256 (carts.token_hash). Se crea al añadir el primer producto.

export const CART_COOKIE = 'pc_cart';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function newCartToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashCartToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Token de la cookie de la petición, si tiene el formato esperado. */
export async function readCartToken(): Promise<string | null> {
  const value = (await cookies()).get(CART_COOKIE)?.value;
  return value && TOKEN_RE.test(value) ? value : null;
}

export async function setCartCookie(token: string, retentionDays: number): Promise<void> {
  (await cookies()).set(CART_COOKIE, token, {
    httpOnly: true,
    // Secure siempre que la web se sirva por https (en local, con http, el navegador no la guardaría).
    secure: cookieIsSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: retentionDays * 24 * 60 * 60,
  });
}

export async function clearCartCookie(): Promise<void> {
  (await cookies()).set(CART_COOKIE, '', { httpOnly: true, secure: cookieIsSecure(), sameSite: 'lax', path: '/', maxAge: 0 });
}
