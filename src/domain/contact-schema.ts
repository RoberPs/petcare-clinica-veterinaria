import { z } from 'zod';

// Validación del formulario de contacto (contracts/contact-form.md). La usan el cliente (límites y
// mensajes) y el servidor, que es la autoridad.

export { CONTACT_FIELDS, LIMITS, MESSAGES, type ContactField } from './contact-fields';
import { LIMITS, MESSAGES, CONTACT_FIELDS, type ContactField } from './contact-fields';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string());

export const contactSchema = z.object({
  nombre: str.pipe(z.string().trim().min(1, MESSAGES.nombre).max(LIMITS.nombre, MESSAGES.nombre)),
  telefono: str.pipe(
    z
      .string()
      .trim()
      .refine((v) => {
        if (v === '') return true;
        if (v.length > LIMITS.telefono || !/^[0-9 +()]+$/.test(v)) return false;
        const digits = v.replace(/\D/g, '').length;
        return digits >= 9 && digits <= 15;
      }, MESSAGES.telefono)
      .transform((v) => (v === '' ? null : v)),
  ),
  email: str.pipe(
    z
      .string()
      .trim()
      .max(LIMITS.email, MESSAGES.email)
      .regex(EMAIL_RE, MESSAGES.email)
      .transform(normalizeEmail),
  ),
  motivo: str.pipe(z.string().trim().min(1, MESSAGES.motivo).max(80, MESSAGES.motivo)),
  mensaje: str.pipe(
    z.string().trim().min(LIMITS.mensajeMin, MESSAGES.mensajeMin).max(LIMITS.mensajeMax, MESSAGES.mensajeMax),
  ),
  privacidad: z.literal('on', { error: MESSAGES.privacidad }),
});

export type ContactInput = z.output<typeof contactSchema>;

/** El dominio del correo se guarda en minúsculas; la parte local se respeta. */
export function normalizeEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`;
}

export type ContactValidation =
  | { ok: true; data: ContactInput }
  | { ok: false; fieldErrors: Partial<Record<ContactField, string>>; values: Partial<Record<ContactField, string>> };

/** Valida los valores del formulario y devuelve los errores por campo y los valores escritos. */
export function validateContact(raw: Partial<Record<ContactField, unknown>>): ContactValidation {
  const parsed = contactSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Partial<Record<ContactField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as ContactField;
    fieldErrors[field] ??= issue.message;
  }
  const values: Partial<Record<ContactField, string>> = {};
  for (const f of CONTACT_FIELDS) {
    const v = raw[f];
    if (typeof v === 'string') values[f] = v.slice(0, f === 'mensaje' ? LIMITS.mensajeMax + 100 : 300);
  }
  return { ok: false, fieldErrors, values };
}
