import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import {
  deleteAllSessions,
  deleteOtherSessions,
  deleteSession,
  findSessionWithCustomer,
  insertSession,
  touchSession,
  type CustomerRow,
  type SessionRow,
} from '@/db/queries/sessions';
import type { DbOrTx } from '@/db/client';
import { getNow } from '@/lib/clock';

// Sesiones propias en PostgreSQL (A2). La cookie lleva 32 bytes aleatorios en base64url; la base de
// datos solo guarda su SHA-256, así que una copia de la base no sirve para entrar.

export const SESSION_COOKIE = 'pc_session';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SESSION_POLICY = {
  /** Sin "Recordarme": se cierra tras 2 h sin actividad, con un tope absoluto de 12 h. */
  idleMs: 2 * HOUR,
  absoluteMs: 12 * HOUR,
  /** Con "Recordarme": 30 días, sin caducidad por inactividad. */
  rememberMs: 30 * DAY,
  /** last_seen_at se reescribe como mucho una vez por minuto. */
  touchEveryMs: MINUTE,
} as const;

/** Cliente de la sesión actual, sin el hash de la contraseña. */
export type CurrentCustomer = Omit<CustomerRow, 'passwordHash'> & { sessionHash: string; remember: boolean };

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Secure siempre que la web se sirva por https (en local, con http, el navegador no la guardaría). */
export function cookieIsSecure(): boolean {
  return (process.env.SITE_URL ?? '').startsWith('https://');
}

function sessionCookieOptions(remember: boolean) {
  return {
    httpOnly: true,
    secure: cookieIsSecure(),
    sameSite: 'lax' as const,
    path: '/',
    // Sin Max-Age la cookie es de sesión del navegador: se borra al cerrarlo.
    ...(remember ? { maxAge: SESSION_POLICY.rememberMs / 1000 } : {}),
  };
}

export function isSessionValid(session: Pick<SessionRow, 'remember' | 'expiresAt' | 'lastSeenAt'>, now: Date): boolean {
  if (now.getTime() >= session.expiresAt.getTime()) return false;
  if (!session.remember && now.getTime() >= session.lastSeenAt.getTime() + SESSION_POLICY.idleMs) return false;
  return true;
}

/** Crea la fila de la sesión y devuelve el token en claro (sin tocar cookies). */
export async function startSession(
  customerId: string,
  remember: boolean,
  now: Date,
  db?: DbOrTx,
): Promise<{ token: string; tokenHash: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + (remember ? SESSION_POLICY.rememberMs : SESSION_POLICY.absoluteMs));
  await insertSession({ tokenHash, customerId, remember, now, expiresAt }, db);
  return { token, tokenHash, expiresAt };
}

/**
 * Busca la sesión de un token y comprueba que sigue vigente. Si lo está, actualiza last_seen_at
 * (como mucho una vez por minuto); si ha caducado, borra la fila.
 */
export async function lookupSession(token: string, now: Date, db?: DbOrTx): Promise<CurrentCustomer | null> {
  if (!token || token.length > 100) return null;
  const tokenHash = hashToken(token);
  const found = await findSessionWithCustomer(tokenHash, db);
  if (!found) return null;
  if (!isSessionValid(found.session, now)) {
    await deleteSession(tokenHash, db);
    return null;
  }
  if (now.getTime() - found.session.lastSeenAt.getTime() >= SESSION_POLICY.touchEveryMs) {
    await touchSession(tokenHash, now, db);
  }
  // Una cuenta sin verificar nunca tiene sesión (FR-010); por si acaso, no se acepta.
  if (!found.customer.emailVerifiedAt) return null;
  const { passwordHash: _omit, ...customer } = found.customer;
  return { ...customer, sessionHash: tokenHash, remember: found.session.remember };
}

// ---------- Con cookies (Server Components, Server Actions y rutas) ----------

/** Inicia sesión: crea la fila y pone la cookie. Solo en Server Actions o rutas. */
export async function createSession(customerId: string, remember: boolean, now?: Date): Promise<string> {
  const { token, tokenHash } = await startSession(customerId, remember, now ?? (await getNow()));
  await setSessionCookie(token, remember);
  return tokenHash;
}

/** Pone la cookie de una sesión ya creada con startSession(). Solo en Server Actions o rutas. */
export async function setSessionCookie(token: string, remember: boolean): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(remember));
}

/** Sesión de la petición actual. Se memoriza por petición (layout y página la piden los dos). */
export const getCurrentSession = cache(async (): Promise<CurrentCustomer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return lookupSession(token, await getNow());
});

/** Cierra la sesión actual en el servidor. La cookie se borra con clearSessionCookie(). */
export async function revokeSession(tokenHash?: string): Promise<void> {
  if (tokenHash) {
    await deleteSession(tokenHash);
    return;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(hashToken(token));
}

export async function revokeOtherSessions(customerId: string, keepHash: string, db?: DbOrTx): Promise<number> {
  return deleteOtherSessions(customerId, keepHash, db);
}

export async function revokeAllSessions(customerId: string, db?: DbOrTx): Promise<number> {
  return deleteAllSessions(customerId, db);
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', { ...sessionCookieOptions(false), maxAge: 0 });
}
