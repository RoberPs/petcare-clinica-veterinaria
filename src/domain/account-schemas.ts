import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import { ACCOUNT_LIMITS, PASSWORD_MAX } from './account-fields';
import { checkPassword, PASSWORD_MESSAGES } from './password-policy';

// Validación de los formularios de la cuenta (contracts/forms.md). Mensajes en español; los nombres
// de los campos son los atributos `name` de los formularios.

export { ACCOUNT_LIMITS };

export const ACCOUNT_MESSAGES = {
  first_name: 'Escribe tu nombre.',
  first_name_long: `El nombre no puede superar los ${ACCOUNT_LIMITS.firstName} caracteres.`,
  last_name: 'Escribe tus apellidos.',
  last_name_long: `Los apellidos no pueden superar los ${ACCOUNT_LIMITS.lastName} caracteres.`,
  email: 'Escribe un correo válido, por ejemplo nombre@dominio.es.',
  phone: 'Escribe un teléfono válido, por ejemplo 600 123 456.',
  password_required: 'Escribe tu contraseña.',
  password_confirm: 'Las contraseñas no coinciden.',
  accept_terms: 'Para crear la cuenta debes aceptar la política de privacidad y los términos.',
  current_password: 'Escribe tu contraseña actual.',
  current_password_wrong: 'La contraseña actual no es correcta.',
  address_line: `La dirección no puede superar los ${ACCOUNT_LIMITS.addressLine} caracteres.`,
  postal_code: 'Escribe un código postal de 5 cifras.',
  postal_code_needs_city: 'Escribe también la localidad.',
  city_needs_postal_code: 'Escribe también el código postal.',
  city: `La localidad no puede superar los ${ACCOUNT_LIMITS.city} caracteres.`,
  province: `La provincia no puede superar los ${ACCOUNT_LIMITS.province} caracteres.`,
  pet_name: 'Escribe el nombre de tu mascota.',
  pet_name_long: `El nombre no puede superar los ${ACCOUNT_LIMITS.petName} caracteres.`,
  species: 'Elige una especie.',
  birth_date: 'Escribe la fecha de nacimiento.',
  birth_date_future: 'La fecha no puede ser futura.',
  birth_date_too_old: `La fecha no puede ser de hace más de ${ACCOUNT_LIMITS.petMaxAgeYears} años.`,
} as const;

/** Valor de la opción "Otra" del selector de especie. Se guarda como species_key = NULL (A10). */
export const OTHER_SPECIES = 'other';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d{9,15}$/;
const POSTAL_CODE_RE = /^\d{5}$/;

/** El correo se compara siempre normalizado (FR-004). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Teléfono sin espacios, puntos, guiones ni paréntesis, para validarlo. Se guarda tal como se escribió. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s.\-()]/g, '');
}

// Los campos llegan de un formulario: lo que no es texto se trata como vacío.
const str = z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string());
const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

const required = (message: string, max: number, maxMessage: string) =>
  str.pipe(z.string().trim().min(1, message).max(max, maxMessage));

const optional = (max: number, message: string) =>
  str.pipe(
    z
      .string()
      .trim()
      .max(max, message)
      .transform((v) => (v === '' ? null : v)),
  );

const emailField = str.pipe(
  z.string().trim().min(1, ACCOUNT_MESSAGES.email).max(ACCOUNT_LIMITS.email, ACCOUNT_MESSAGES.email).regex(EMAIL_RE, ACCOUNT_MESSAGES.email),
);

const phoneField = str.pipe(
  z
    .string()
    .trim()
    .refine((v) => v === '' || (v.length <= ACCOUNT_LIMITS.phone && PHONE_RE.test(normalizePhone(v))), ACCOUNT_MESSAGES.phone)
    .transform((v) => (v === '' ? null : v)),
);

/** Texto de la contraseña tal cual (sin trim: los espacios cuentan). */
const rawPassword = z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string());

/** Añade los errores de la política de contraseñas (A7) y de la repetición. */
function refineNewPassword(
  value: { password: string; password_confirm: string },
  email: string | null | undefined,
  ctx: z.RefinementCtx,
): void {
  const check = checkPassword(value.password, email);
  if (check !== 'ok') ctx.addIssue({ code: 'custom', path: ['password'], message: PASSWORD_MESSAGES[check] });
  if (value.password !== value.password_confirm) {
    ctx.addIssue({ code: 'custom', path: ['password_confirm'], message: ACCOUNT_MESSAGES.password_confirm });
  }
}

const nameFields = {
  first_name: required(ACCOUNT_MESSAGES.first_name, ACCOUNT_LIMITS.firstName, ACCOUNT_MESSAGES.first_name_long),
  last_name: required(ACCOUNT_MESSAGES.last_name, ACCOUNT_LIMITS.lastName, ACCOUNT_MESSAGES.last_name_long),
};

export const registerSchema = z
  .object({
    ...nameFields,
    email: emailField,
    phone: phoneField,
    password: rawPassword,
    password_confirm: rawPassword,
    // Con refine (y no con literal) el error es "continuable": se siguen validando las contraseñas.
    accept_terms: checkbox.refine((v) => v, ACCOUNT_MESSAGES.accept_terms),
    marketing_opt_in: checkbox,
  })
  .superRefine((v, ctx) => refineNewPassword(v, v.email, ctx));

export const loginSchema = z.object({
  email: emailField,
  password: rawPassword.pipe(z.string().min(1, ACCOUNT_MESSAGES.password_required).max(PASSWORD_MAX * 4)),
  remember: checkbox,
});

export const emailOnlySchema = z.object({ email: emailField });

/** Nueva contraseña con su repetición (restablecimiento). `email` sirve para la regla "sin el correo". */
export const newPasswordSchema = (email: string | null) =>
  z
    .object({ password: rawPassword, password_confirm: rawPassword })
    .superRefine((v, ctx) => refineNewPassword(v, email, ctx));

export const changePasswordSchema = (email: string | null) =>
  z
    .object({
      current_password: rawPassword.pipe(z.string().min(1, ACCOUNT_MESSAGES.current_password)),
      password: rawPassword,
      password_confirm: rawPassword,
    })
    .superRefine((v, ctx) => refineNewPassword(v, email, ctx));

export const profileSchema = z
  .object({
    ...nameFields,
    phone: phoneField,
    address_line: optional(ACCOUNT_LIMITS.addressLine, ACCOUNT_MESSAGES.address_line),
    postal_code: str.pipe(
      z
        .string()
        .trim()
        .refine((v) => v === '' || POSTAL_CODE_RE.test(v), ACCOUNT_MESSAGES.postal_code)
        .transform((v) => (v === '' ? null : v)),
    ),
    city: optional(ACCOUNT_LIMITS.city, ACCOUNT_MESSAGES.city),
    province: optional(ACCOUNT_LIMITS.province, ACCOUNT_MESSAGES.province),
  })
  .superRefine((v, ctx) => {
    // Código postal y localidad van juntos (data-model.md).
    if (v.postal_code && !v.city) ctx.addIssue({ code: 'custom', path: ['city'], message: ACCOUNT_MESSAGES.postal_code_needs_city });
    if (v.city && !v.postal_code) ctx.addIssue({ code: 'custom', path: ['postal_code'], message: ACCOUNT_MESSAGES.city_needs_postal_code });
  });

export const marketingSchema = z.object({ marketing_opt_in: checkbox });

export const deleteAccountSchema = z.object({
  current_password: rawPassword.pipe(z.string().min(1, ACCOUNT_MESSAGES.current_password)),
});

/**
 * Mascota (FR-024): especie de la lista u "Otra" (→ null) y fecha entre hoy menos 40 años y hoy.
 * `today` es la fecha de hoy en Europe/Madrid (AAAA-MM-DD).
 */
export const petSchema = (speciesKeys: readonly string[], today: string) => {
  const todayDate = Temporal.PlainDate.from(today);
  const oldest = todayDate.subtract({ years: ACCOUNT_LIMITS.petMaxAgeYears });
  return z.object({
    name: required(ACCOUNT_MESSAGES.pet_name, ACCOUNT_LIMITS.petName, ACCOUNT_MESSAGES.pet_name_long),
    species: str.pipe(
      z
        .string()
        .trim()
        .refine((v) => v === OTHER_SPECIES || speciesKeys.includes(v), ACCOUNT_MESSAGES.species)
        .transform((v) => (v === OTHER_SPECIES ? null : v)),
    ),
    birth_date: str.pipe(
      z
        .string()
        .trim()
        .superRefine((v, ctx) => {
          let date: Temporal.PlainDate;
          try {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('formato');
            date = Temporal.PlainDate.from(v, { overflow: 'reject' });
          } catch {
            ctx.addIssue({ code: 'custom', message: ACCOUNT_MESSAGES.birth_date });
            return;
          }
          if (Temporal.PlainDate.compare(date, todayDate) > 0) {
            ctx.addIssue({ code: 'custom', message: ACCOUNT_MESSAGES.birth_date_future });
          } else if (Temporal.PlainDate.compare(date, oldest) < 0) {
            ctx.addIssue({ code: 'custom', message: ACCOUNT_MESSAGES.birth_date_too_old });
          }
        }),
    ),
  });
};

// ---------- Resultado común ----------

/** Campos que nunca se devuelven al formulario tras un error (contracts/forms.md). */
const SECRET_FIELDS = new Set(['password', 'password_confirm', 'current_password']);
const MAX_ECHO = 300;

export type FieldErrors = Record<string, string>;
export type FormValues = Record<string, string>;

export type FormValidation<T> = { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors; values: FormValues };

/**
 * Valida `raw` con `schema`. Si falla, devuelve el primer error de cada campo y los valores escritos
 * (recortados y sin las contraseñas), para volver a pintar el formulario.
 */
export function validateForm<S extends z.ZodType>(schema: S, raw: Record<string, unknown>): FormValidation<z.output<S>> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? '_form');
    fieldErrors[field] ??= issue.message;
  }
  return { ok: false, fieldErrors, values: echoValues(raw) };
}

/** Valores para volver a pintar un formulario: texto recortado y nunca las contraseñas. */
export function echoValues(raw: Record<string, unknown>): FormValues {
  const values: FormValues = {};
  for (const [key, v] of Object.entries(raw)) {
    if (!SECRET_FIELDS.has(key) && typeof v === 'string') values[key] = v.slice(0, MAX_ECHO);
  }
  return values;
}
