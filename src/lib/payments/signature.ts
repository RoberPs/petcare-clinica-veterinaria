import { createHmac, timingSafeEqual } from 'node:crypto';

// Firma de los avisos de la pasarela (contracts/payments.md): cabecera
// "Stripe-Signature: t=<unix>,v1=<hex>" con HMAC_SHA256(secreto, t + "." + cuerpo crudo).
// La pasarela simulada usa el mismo formato con una clave derivada de FORM_SECRET.

export const SIGNATURE_TOLERANCE_S = 300;

export class InvalidSignature extends Error {
  constructor(reason: string) {
    super(`invalid_signature:${reason}`);
    this.name = 'InvalidSignature';
  }
}

const hmacHex = (secret: string, data: string) => createHmac('sha256', secret).update(data, 'utf8').digest('hex');

/** Cabecera firmada para un cuerpo (pasarela simulada y pruebas). */
export function signatureHeader(rawBody: string, secret: string, now: Date): string {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v1=${hmacHex(secret, `${t}.${rawBody}`)}`;
}

/** Lanza InvalidSignature si la firma no es válida, falta o está fuera de la tolerancia de 300 s. */
export function verifyStripeSignature(rawBody: string, header: string | null | undefined, secret: string, now: Date): void {
  if (!header || header.length > 2000) throw new InvalidSignature('missing');
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key?.trim() === 't' && value && /^\d{1,12}$/.test(value.trim())) t = Number(value.trim());
    if (key?.trim() === 'v1' && value) v1.push(value.trim());
  }
  if (t === null) throw new InvalidSignature('no_timestamp');
  if (v1.length === 0) throw new InvalidSignature('no_v1');
  if (Math.abs(now.getTime() / 1000 - t) > SIGNATURE_TOLERANCE_S) throw new InvalidSignature('expired');
  const expected = Buffer.from(hmacHex(secret, `${t}.${rawBody}`), 'hex');
  // Stripe puede mandar varias firmas v1 (rotación del secreto): vale cualquiera.
  const ok = v1.some((sig) => {
    if (!/^[0-9a-f]+$/i.test(sig)) return false;
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new InvalidSignature('mismatch');
}
