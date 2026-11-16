import { describe, expect, it } from 'vitest';
import {
  bucketKey,
  isPolicyLimited,
  isRateLimited,
  RATE_POLICIES,
  retryAfterMinutes,
  toBucket,
  toPolicyBucket,
} from '@/domain/rate-limit';
import { getClientIp } from '@/lib/client-ip';

const SECRET = 'secreto-de-pruebas-unitarias-de-32-caracteres-o-mas';

describe('toBucket y bucketKey', () => {
  it('IPv4 completa', () => {
    expect(bucketKey('203.0.113.7')).toBe('203.0.113.7');
    expect(toBucket('203.0.113.7', SECRET)).not.toBe(toBucket('203.0.113.8', SECRET));
  });

  it('IPv6 agrupada por /64', () => {
    expect(bucketKey('2001:db8:abcd:12:1::5')).toBe('2001:db8:abcd:12::/64');
    expect(toBucket('2001:db8:abcd:12::1', SECRET)).toBe(toBucket('2001:0db8:abcd:0012:ffff:1:2:3', SECRET));
    expect(toBucket('2001:db8:abcd:12::1', SECRET)).not.toBe(toBucket('2001:db8:abcd:13::1', SECRET));
    expect(bucketKey('::1')).toBe('0:0:0:0::/64');
  });

  it('IPv4 mapeada en IPv6 cuenta como la IPv4', () => {
    expect(bucketKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(toBucket('::ffff:203.0.113.7', SECRET)).toBe(toBucket('203.0.113.7', SECRET));
  });

  it('el resultado es un HMAC en hexadecimal que no contiene la IP', () => {
    const bucket = toBucket('203.0.113.7', SECRET);
    expect(bucket).toMatch(/^[0-9a-f]{64}$/);
    expect(bucket).not.toContain('203');
    expect(toBucket('203.0.113.7', `${SECRET}-otro`)).not.toBe(bucket);
  });

  it('5 envíos en la ventana bloquean el sexto', () => {
    expect(isRateLimited(4)).toBe(false);
    expect(isRateLimited(5)).toBe(true);
  });
});

describe('getClientIp', () => {
  const headers = (xff: string | null) => ({ get: (n: string) => (n === 'x-forwarded-for' ? xff : null) });

  it('detrás del proxy de confianza usa el primer valor (lo escribe Caddy)', () => {
    expect(getClientIp(headers('198.51.100.4, 10.0.0.2'), ['10.0.0.2'])).toBe('198.51.100.4');
  });

  it('sin proxy usa el último valor (el que añade el servidor)', () => {
    expect(getClientIp(headers('1.2.3.4, 127.0.0.1'), [])).toBe('127.0.0.1');
    expect(getClientIp(headers(null), [])).toBe('desconocida');
  });
});

describe('políticas con nombre (A6)', () => {
  it('tienen los límites decididos y "contact" no cambia', () => {
    expect(RATE_POLICIES.contact).toMatchObject({ max: 5, windowMinutes: 10 });
    expect(RATE_POLICIES.login_account).toMatchObject({ max: 5, windowMinutes: 15 });
    expect(RATE_POLICIES.login_origin).toMatchObject({ max: 20, windowMinutes: 15 });
    expect(RATE_POLICIES.auth_origin).toMatchObject({ max: 10, windowMinutes: 10 });
    expect(toPolicyBucket('contact', '203.0.113.7', SECRET)).toBe(toBucket('203.0.113.7', SECRET));
  });

  it('el bucket lleva el prefijo de la política y nunca la clave en claro', () => {
    const b = toPolicyBucket('login_account', 'Ana@Example.test', SECRET);
    expect(b).toMatch(/^login_account:[0-9a-f]{64}$/);
    expect(b).not.toContain('ana');
    expect(toPolicyBucket('login_account', ' ana@example.TEST ', SECRET)).toBe(b);
  });

  it('las políticas por origen agrupan IPv6 por /64 y no se mezclan entre sí', () => {
    expect(toPolicyBucket('auth_origin', '2001:db8:1:2::1', SECRET)).toBe(toPolicyBucket('auth_origin', '2001:db8:1:2:ffff::9', SECRET));
    expect(toPolicyBucket('auth_origin', '203.0.113.7', SECRET)).not.toBe(toPolicyBucket('login_origin', '203.0.113.7', SECRET));
  });

  it('bloquea al llegar al máximo', () => {
    expect(isPolicyLimited('login_account', 4)).toBe(false);
    expect(isPolicyLimited('login_account', 5)).toBe(true);
    expect(isPolicyLimited('login_origin', 19)).toBe(false);
    expect(isPolicyLimited('login_origin', 20)).toBe(true);
  });

  it('checkout_origin: 5 pedidos cada 10 minutos por origen (feature 005)', () => {
    expect(RATE_POLICIES.checkout_origin).toMatchObject({ max: 5, windowMinutes: 10, key: 'origin' });
    expect(isPolicyLimited('checkout_origin', 4)).toBe(false);
    expect(isPolicyLimited('checkout_origin', 5)).toBe(true);
    expect(toPolicyBucket('checkout_origin', '203.0.113.7', SECRET)).toMatch(/^checkout_origin:[0-9a-f]{64}$/);
  });

  it('discount_origin: 10 intentos cada 10 minutos por origen (D12)', () => {
    expect(RATE_POLICIES.discount_origin).toMatchObject({ max: 10, windowMinutes: 10, key: 'origin' });
    expect(isPolicyLimited('discount_origin', 9)).toBe(false);
    expect(isPolicyLimited('discount_origin', 10)).toBe(true);
    expect(toPolicyBucket('discount_origin', '2001:db8::1', SECRET)).toBe(toPolicyBucket('discount_origin', '2001:db8::2', SECRET));
  });

  it('booking_origin: 5 reservas cada 10 minutos por origen (B9), separado del contacto', () => {
    expect(RATE_POLICIES.booking_origin).toMatchObject({ max: 5, windowMinutes: 10, key: 'origin' });
    expect(isPolicyLimited('booking_origin', 4)).toBe(false);
    expect(isPolicyLimited('booking_origin', 5)).toBe(true);
    expect(toPolicyBucket('booking_origin', '203.0.113.7', SECRET)).toMatch(/^booking_origin:[0-9a-f]{64}$/);
    expect(toPolicyBucket('booking_origin', '203.0.113.7', SECRET)).not.toBe(toPolicyBucket('contact', '203.0.113.7', SECRET));
  });

  it('calcula los minutos hasta que vuelve a haber hueco (como mínimo 1)', () => {
    const now = new Date('2026-11-11T10:00:00Z');
    expect(retryAfterMinutes(new Date('2026-11-11T09:50:00Z'), 'login_account', now)).toBe(5);
    expect(retryAfterMinutes(new Date('2026-11-11T09:45:30Z'), 'login_account', now)).toBe(1);
    expect(retryAfterMinutes(new Date('2026-11-11T09:59:59Z'), 'login_account', now)).toBe(15);
    expect(retryAfterMinutes(new Date('2026-11-11T09:40:00Z'), 'login_account', now)).toBe(1);
  });
});
