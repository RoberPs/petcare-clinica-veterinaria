import { cookies } from 'next/headers';
import { sign, verify } from '@/lib/signing';
import { cookieIsSecure } from './session';

// Cookie firmada pc_login_hint (A4): tras confirmar el correo, rellena el campo en "Iniciar sesión".
// No va en la URL para que el correo no aparezca en los logs de acceso. Dura 10 minutos y solo se
// envía a /iniciar-sesion; la borra la acción de iniciar sesión.

export const LOGIN_HINT_COOKIE = 'pc_login_hint';
const PATH = '/iniciar-sesion';
const MAX_AGE_S = 10 * 60;

export async function setLoginHint(email: string, now: Date = new Date()): Promise<void> {
  (await cookies()).set(LOGIN_HINT_COOKIE, sign(JSON.stringify({ e: email, t: now.getTime() })), {
    httpOnly: true,
    secure: cookieIsSecure(),
    sameSite: 'lax',
    path: PATH,
    maxAge: MAX_AGE_S,
  });
}

/** Correo de la cookie si es válida y no ha caducado. */
export async function readLoginHint(now: Date = new Date()): Promise<string | null> {
  const payload = verify((await cookies()).get(LOGIN_HINT_COOKIE)?.value ?? null);
  if (!payload) return null;
  try {
    const { e, t } = JSON.parse(payload) as { e?: unknown; t?: unknown };
    if (typeof e !== 'string' || typeof t !== 'number' || now.getTime() - t > MAX_AGE_S * 1000) return null;
    return e.slice(0, 254);
  } catch {
    return null;
  }
}

export async function clearLoginHint(): Promise<void> {
  (await cookies()).set(LOGIN_HINT_COOKIE, '', { httpOnly: true, secure: cookieIsSecure(), sameSite: 'lax', path: PATH, maxAge: 0 });
}
