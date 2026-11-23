import { requireEnv } from './env';
import { sign, verify } from './signing';

// Cookie propia y esencial con la elección de cookies (R8, contracts/consent-and-email.md).
export const CONSENT_COOKIE = 'pc_consent';
export const CONSENT_MAX_AGE = 31_536_000; // 12 meses, en segundos

export interface Consent {
  v: string;
  third_party: boolean;
  at: string;
}

interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export function encodeConsent(thirdParty: boolean, now: Date = new Date()): string {
  const consent: Consent = { v: requireEnv('CONSENT_VERSION'), third_party: thirdParty, at: now.toISOString() };
  return sign(JSON.stringify(consent));
}

/** Lee la elección. Devuelve null si falta, si la firma no es válida o si la versión ya no es la vigente. */
export function decodeConsent(value: string | undefined | null): Consent | null {
  const payload = verify(value);
  if (!payload) return null;
  try {
    const data = JSON.parse(payload) as Partial<Consent>;
    if (typeof data.v !== 'string' || typeof data.third_party !== 'boolean' || typeof data.at !== 'string') return null;
    if (data.v !== requireEnv('CONSENT_VERSION')) return null;
    return { v: data.v, third_party: data.third_party, at: data.at };
  } catch {
    return null;
  }
}

export function getConsent(cookies: CookieReader): Consent | null {
  return decodeConsent(cookies.get(CONSENT_COOKIE)?.value);
}

export const consentCookieOptions = {
  path: '/',
  maxAge: CONSENT_MAX_AGE,
  sameSite: 'lax' as const,
  secure: true,
  httpOnly: true,
};
