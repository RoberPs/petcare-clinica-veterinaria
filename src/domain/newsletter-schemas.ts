import { z } from 'zod';
import { normalizeEmail } from './account-schemas';

// Validación del formulario del boletín (contracts/routes.md, E9 y E16). Mensajes en español; los
// nombres de los campos son los atributos `name` del formulario.

export const NEWSLETTER_EMAIL_MAX = 254;

export const NEWSLETTER_MESSAGES = {
  email: 'Escribe un correo válido, por ejemplo nombre@dominio.es.',
  accept_policy: 'Para suscribirte debes aceptar la política del boletín.',
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string());
const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

const emailField = str.pipe(
  z
    .string()
    .trim()
    .min(1, NEWSLETTER_MESSAGES.email)
    .max(NEWSLETTER_EMAIL_MAX, NEWSLETTER_MESSAGES.email)
    .regex(EMAIL_RE, NEWSLETTER_MESSAGES.email)
    .transform(normalizeEmail),
);

/** Páginas a las que vuelve el formulario (lista cerrada): la portada o el listado de consejos. */
const RETURN_TO_RE = /^\/consejos(\?[A-Za-z0-9=&%._~+-]{0,300})?$/;
export function safeNewsletterReturnTo(value: unknown): string {
  return typeof value === 'string' && (value === '/' || RETURN_TO_RE.test(value)) ? value : '/';
}

export const subscribeSchema = z.object({
  email: emailField,
  accept_policy: checkbox.refine((v) => v, NEWSLETTER_MESSAGES.accept_policy),
});

export const resendSchema = z.object({ email: emailField });

export type SubscribeInput = z.infer<typeof subscribeSchema>;
