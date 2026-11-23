import { createHmac } from 'node:crypto';

// Límite por origen (R6): 5 envíos cada 10 minutos por IPv4 o por prefijo IPv6 /64.
// La IP nunca se guarda en claro: el "bucket" es HMAC-SHA256(secreto, "contact:" + clave).
// La feature 002 añade políticas con nombre (A6) sobre la misma tabla rate_limit_hits.

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

// ---------- Políticas con nombre (feature 002, A6) ----------

export interface RatePolicy {
  max: number;
  windowMinutes: number;
  /** Qué identifica al que lo intenta: el origen (IP o /64) o la cuenta (correo normalizado). */
  key: 'origin' | 'account';
}

export const RATE_POLICIES = {
  contact: { max: RATE_LIMIT.max, windowMinutes: RATE_LIMIT.windowMinutes, key: 'origin' },
  /** Fallos de inicio de sesión por cuenta (también si el correo no existe). */
  login_account: { max: 5, windowMinutes: 15, key: 'account' },
  /** Fallos de inicio de sesión por origen. */
  login_origin: { max: 20, windowMinutes: 15, key: 'origin' },
  /** Registro, reenvío de verificación y recuperación de contraseña, por origen. */
  auth_origin: { max: 10, windowMinutes: 10, key: 'origin' },
  /** Reservas de cita (feature 003, B9), por origen: el mismo criterio que el contacto. */
  booking_origin: { max: 5, windowMinutes: 10, key: 'origin' },
  /** Pedidos confirmados (feature 005), por origen. */
  checkout_origin: { max: 5, windowMinutes: 10, key: 'origin' },
  /** Intentos de código de descuento (feature 005, D12), por origen: evita adivinar códigos. */
  discount_origin: { max: 10, windowMinutes: 10, key: 'origin' },
} as const satisfies Record<string, RatePolicy>;

export type RatePolicyName = keyof typeof RATE_POLICIES;

/**
 * Bucket de una política: "<política>:" + HMAC. La clave es la IP (agrupada como bucketKey) o el
 * correo normalizado; ninguna se guarda en claro. La política "contact" conserva su formato de la 001.
 */
export function toPolicyBucket(policy: RatePolicyName, key: string, secret: string): string {
  if (policy === 'contact') return toBucket(key, secret);
  const value = RATE_POLICIES[policy].key === 'origin' ? bucketKey(key) : key.trim().toLowerCase();
  return `${policy}:${createHmac('sha256', secret).update(`${policy}:${value}`).digest('hex')}`;
}

export function isPolicyLimited(policy: RatePolicyName, recentHits: number): boolean {
  return recentHits >= RATE_POLICIES[policy].max;
}

/**
 * Minutos hasta que vuelve a haber hueco: el intento más antiguo de la ventana más la duración de
 * la ventana. Siempre al menos 1, para que el mensaje "en N minutos" tenga sentido.
 */
export function retryAfterMinutes(oldestHitInWindow: Date, policy: RatePolicyName, now: Date): number {
  const freeAt = oldestHitInWindow.getTime() + RATE_POLICIES[policy].windowMinutes * 60_000;
  return Math.max(1, Math.ceil((freeAt - now.getTime()) / 60_000));
}
