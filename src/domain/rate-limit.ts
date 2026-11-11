import { createHmac } from 'node:crypto';

// Límite por origen (R6): 5 envíos cada 10 minutos por IPv4 o por prefijo IPv6 /64.
// La IP nunca se guarda en claro: el "bucket" es HMAC-SHA256(secreto, "contact:" + clave).

export const RATE_LIMIT = { max: 5, windowMinutes: 10 } as const;

/** Los 8 grupos de una IPv6 en hexadecimal sin ceros a la izquierda, o null si no es válida. */
function ipv6Groups(ip: string): string[] | null {
  let addr = ip;
  // Una IPv4 incrustada al final ocupa los dos últimos grupos.
  const v4 = addr.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    addr = `${addr.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const parts = addr.split('::');
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const fill = parts.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0) return null;
  const groups = [...left, ...Array<string>(fill).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.map((g) => parseInt(g, 16).toString(16));
}

/** Clave de agrupación: IPv4 completa (también si viene mapeada en IPv6) o el prefijo IPv6 /64. */
export function bucketKey(rawIp: string): string {
  const ip = rawIp.trim().replace(/^\[|\]$/g, '').split('%')[0]!;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
  const groups = ip.includes(':') ? ipv6Groups(ip) : null;
  if (!groups) return ip || 'desconocida';
  const isMapped = groups.slice(0, 5).every((g) => g === '0') && groups[5] === 'ffff';
  if (isMapped) {
    const hi = parseInt(groups[6]!, 16);
    const lo = parseInt(groups[7]!, 16);
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
  }
  return `${groups.slice(0, 4).join(':')}::/64`;
}

export function toBucket(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(`contact:${bucketKey(ip)}`).digest('hex');
}

export function isRateLimited(recentHits: number): boolean {
  return recentHits >= RATE_LIMIT.max;
}
