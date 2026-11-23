import { afterEach, describe, expect, it } from 'vitest';
import { CONSENT_MAX_AGE, consentCookieOptions, decodeConsent, encodeConsent } from '@/lib/consent';
import { sign } from '@/lib/signing';
import { isSafeReturnTo } from '@/lib/return-to';

describe('cookie de consentimiento pc_consent', () => {
  afterEach(() => {
    process.env.CONSENT_VERSION = '1';
  });

  it('se lee lo que se escribe', () => {
    const value = encodeConsent(true, new Date('2026-11-10T10:00:00Z'));
    expect(decodeConsent(value)).toEqual({ v: '1', third_party: true, at: '2026-11-10T10:00:00.000Z' });
  });

  it('el valor es base64url(JSON) + "." + HMAC', () => {
    const value = encodeConsent(false);
    expect(value).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const json = JSON.parse(Buffer.from(value.split('.')[0]!, 'base64url').toString());
    expect(json).toMatchObject({ v: '1', third_party: false });
  });

  it('una firma no válida da null', () => {
    const value = encodeConsent(true);
    expect(decodeConsent(`${value.slice(0, -2)}xx`)).toBeNull();
    const forged = `${Buffer.from(JSON.stringify({ v: '1', third_party: true, at: 'x' })).toString('base64url')}.abc`;
    expect(decodeConsent(forged)).toBeNull();
    expect(decodeConsent(undefined)).toBeNull();
    expect(decodeConsent('basura')).toBeNull();
  });

  it('una versión distinta de CONSENT_VERSION da null (se vuelve a preguntar)', () => {
    const value = encodeConsent(true);
    process.env.CONSENT_VERSION = '2';
    expect(decodeConsent(value)).toBeNull();
  });

  it('un JSON firmado pero con otro formato da null', () => {
    expect(decodeConsent(sign(JSON.stringify({ v: '1', third_party: 'sí' })))).toBeNull();
  });

  it('dura 12 meses y es esencial: HttpOnly, Secure y SameSite=Lax', () => {
    expect(CONSENT_MAX_AGE).toBe(31_536_000);
    expect(consentCookieOptions).toEqual({ path: '/', maxAge: 31_536_000, sameSite: 'lax', secure: true, httpOnly: true });
  });

  it('return_to solo admite rutas internas', () => {
    expect(isSafeReturnTo('/la-clinica')).toBe(true);
    expect(isSafeReturnTo('//evil.example')).toBe(false);
    expect(isSafeReturnTo('/\\evil.example')).toBe(false);
    expect(isSafeReturnTo('https://evil.example')).toBe(false);
    expect(isSafeReturnTo(null)).toBe(false);
  });
});
