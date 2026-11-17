import { createHmac } from 'node:crypto';
import { normalizeEmail } from '@/domain/account-schemas';

// Huella de la constancia de baja (E7): HMAC-SHA256 del correo normalizado con NEWSLETTER_HASH_KEY.
// No es reversible sin la clave y permite comprobar una constancia si el titular reclama.

export class MissingNewsletterKeyError extends Error {
  constructor() {
    super('newsletter_hash_key_missing');
  }
}

export function emailHmac(email: string): string {
  const key = process.env.NEWSLETTER_HASH_KEY;
  if (!key || key.trim() === '') throw new MissingNewsletterKeyError();
  return createHmac('sha256', key).update(normalizeEmail(email), 'utf8').digest('hex');
}
