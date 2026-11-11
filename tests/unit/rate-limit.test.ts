import { describe, expect, it } from 'vitest';
import { bucketKey, isRateLimited, toBucket } from '@/domain/rate-limit';
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
