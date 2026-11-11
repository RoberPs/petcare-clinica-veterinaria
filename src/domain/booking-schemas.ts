import { z } from 'zod';
import { normalizeEmail, petSchema } from './account-schemas';
import { parseIsoDate, type BookableService, type BookableStaff } from './availability';
import { BOOKING_LIMITS, NO_PREFERENCE, OTHER_PET, OTHER_SPECIES } from './booking-fields';
import { formatLongDate } from './time';

// Validación de la reserva de citas (contracts/forms.md y data-model.md). Los nombres de los campos
// son los atributos `name` de los formularios.

export { BOOKING_LIMITS, NO_PREFERENCE, OTHER_PET, OTHER_SPECIES };

export const BOOKING_MESSAGES = {
  servicio: 'Elige un servicio.',
  profesional: 'Elige un profesional de la lista.',
  fecha: (lastDay: string) => `Elige una fecha entre hoy y el ${formatLongDate(lastDay)}.`,
  hora: 'Elige una hora libre.',
  mascota: 'Elige una de tus mascotas.',
  nombre_mascota: `Escribe el nombre de tu mascota (hasta ${BOOKING_LIMITS.petName} caracteres).`,
  especie: 'Elige la especie.',
  nombre: 'Escribe tu nombre y apellidos.',
  telefono: 'Escribe un teléfono de contacto válido.',
  correo: 'Escribe un correo válido.',
  motivo: `El motivo no puede pasar de ${BOOKING_LIMITS.reason} caracteres.`,
  privacidad: 'Debes aceptar la política de privacidad.',
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS_RE = /^[0-9 +()-]{9,20}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (v: string) => UUID_RE.test(v);
export const isHhmm = (v: string) => HHMM_RE.test(v);

/** Teléfono: 9–20 caracteres de [0-9 +()-] y al menos 9 dígitos. */
export function isValidPhone(value: string): boolean {
  const v = value.trim();
  return PHONE_CHARS_RE.test(v) && (v.match(/\d/g)?.length ?? 0) >= 9;
}

const str = z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string());
const text = (min: number, max: number, message: string) => str.pipe(z.string().trim().min(min, message).max(max, message));

const phoneField = str.pipe(z.string().trim().refine(isValidPhone, BOOKING_MESSAGES.telefono));
const emailField = str.pipe(
  z
    .string()
    .trim()
    .min(1, BOOKING_MESSAGES.correo)
    .max(BOOKING_LIMITS.email, BOOKING_MESSAGES.correo)
    .regex(EMAIL_RE, BOOKING_MESSAGES.correo),
);
const reasonField = str.pipe(
  z
    .string()
    .trim()
    .max(BOOKING_LIMITS.reason, BOOKING_MESSAGES.motivo)
    .transform((v) => (v === '' ? null : v)),
);
// Nunca premarcada: solo vale si llega "on" desde la casilla.
const privacyField = z.preprocess((v) => v === 'on', z.boolean()).refine((v) => v, BOOKING_MESSAGES.privacidad);

const speciesField = (speciesKeys: readonly string[]) =>
  str.pipe(
    z
      .string()
      .trim()
      .refine((v) => v === OTHER_SPECIES || speciesKeys.includes(v), BOOKING_MESSAGES.especie)
      .transform((v) => (v === OTHER_SPECIES ? null : v)),
  );

const petNameField = text(1, BOOKING_LIMITS.petName, BOOKING_MESSAGES.nombre_mascota);

// ---------- Pasos 1 y 2 (query GET) ----------

export interface BookingQueryConfig {
  services: readonly BookableService[];
  staff: readonly BookableStaff[];
  today: string;
  lastDay: string;
}

export interface BookingQuery {
  /** Paso que toca pintar. */
  step: 1 | 2 | 3;
  service: BookableService | null;
  /** null = "Sin preferencia". */
  staff: BookableStaff | null;
  /** Fecha válida dentro de la ventana, o null si no viene o no vale. */
  date: string | null;
  /** "HH:MM" con formato válido (falta comprobar que esté libre). */
  time: string | null;
  /** Valor tal cual de ?mascota= (se comprueba la propiedad aparte). */
  pet: string | null;
  errors: Partial<Record<'servicio' | 'profesional' | 'fecha' | 'hora', string>>;
}

const queryShape = z.object({
  servicio: z.string().trim().max(60).optional(),
  profesional: z.string().trim().max(60).optional(),
  fecha: z.string().trim().max(10).optional(),
  hora: z.string().trim().max(5).optional(),
  mascota: z.string().trim().max(40).optional(),
});

/** Un valor de searchParams (que puede repetirse) como texto. */
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/**
 * Interpreta la query de /pide-cita (contracts/routes.md): sin servicio, el paso 1; con servicio y
 * profesional válidos y sin hora, el paso 2; con todo, el paso 3. Un valor no válido vuelve al
 * paso que le toca con el error junto al campo.
 */
export function parseBookingQuery(raw: Record<string, unknown>, cfg: BookingQueryConfig): BookingQuery {
  const parsed = queryShape.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof first(v) === 'string' ? first(v) : undefined])));
  const q = parsed.success ? parsed.data : {};
  const result: BookingQuery = { step: 1, service: null, staff: null, date: null, time: null, pet: q.mascota || null, errors: {} };

  if (!q.servicio) return result;
  const service = cfg.services.find((s) => s.slug === q.servicio) ?? null;
  if (!service) return { ...result, errors: { servicio: BOOKING_MESSAGES.servicio } };
  result.service = service;

  const staffSlug = q.profesional || NO_PREFERENCE;
  if (staffSlug !== NO_PREFERENCE) {
    const member = cfg.staff.find((m) => m.slug === staffSlug && service.staffIds.includes(m.id));
    if (!member) return { ...result, errors: { profesional: BOOKING_MESSAGES.profesional } };
    result.staff = member;
  }
  // El paso 1 solo pasa al 2 con "Continuar", que envía siempre el profesional.
  if (q.profesional === undefined) return result;

  result.step = 2;
  if (q.fecha) {
    const d = parseIsoDate(q.fecha);
    if (!d || d.toString() < cfg.today || d.toString() > cfg.lastDay) {
      return { ...result, errors: { fecha: BOOKING_MESSAGES.fecha(cfg.lastDay) } };
    }
    result.date = d.toString();
  }
  if (q.hora !== undefined && result.date) {
    if (!isHhmm(q.hora)) return { ...result, errors: { hora: BOOKING_MESSAGES.hora } };
    result.time = q.hora;
    result.step = 3;
  }
  return result;
}

// ---------- Paso 3 (Server Action) ----------

/** Datos del invitado (FR-009). */
export const guestDetailsSchema = (speciesKeys: readonly string[]) =>
  z.object({
    nombre_mascota: petNameField,
    especie: speciesField(speciesKeys),
    nombre: text(2, BOOKING_LIMITS.name, BOOKING_MESSAGES.nombre),
    telefono: phoneField,
    correo: emailField,
    motivo: reasonField,
    privacidad: privacyField,
  });

export type GuestDetails = z.output<ReturnType<typeof guestDetailsSchema>>;

/**
 * Datos del cliente (FR-011). El nombre y el correo salen de la cuenta, nunca del formulario. Con
 * "Otra mascota…" se piden los datos de "Añadir mascota" (la fecha con la regla de la 002). El
 * teléfono solo se pide si la cuenta no lo tiene.
 */
export const customerDetailsSchema = (speciesKeys: readonly string[], today: string, options: { phoneRequired: boolean }) => {
  const birthDate = petSchema(speciesKeys, today).shape.birth_date;
  return z
    .object({
      mascota: str.pipe(z.string().trim().refine((v) => v === OTHER_PET || isUuid(v), BOOKING_MESSAGES.mascota)),
      nombre_mascota: str,
      especie: str,
      fecha_nacimiento: str,
      telefono: str,
      motivo: reasonField,
      privacidad: privacyField,
    })
    .superRefine((v, ctx) => {
      if (v.mascota === OTHER_PET) {
        for (const [key, schema] of [
          ['nombre_mascota', petNameField],
          ['especie', speciesField(speciesKeys)],
          ['fecha_nacimiento', birthDate],
        ] as const) {
          const r = (schema as z.ZodType).safeParse(v[key]);
          if (!r.success) ctx.addIssue({ code: 'custom', path: [key], message: r.error.issues[0]!.message });
        }
      }
      if ((options.phoneRequired || v.telefono.trim() !== '') && !isValidPhone(v.telefono)) {
        ctx.addIssue({ code: 'custom', path: ['telefono'], message: BOOKING_MESSAGES.telefono });
      }
    })
    .transform((v) => ({
      mascota: v.mascota,
      newPet:
        v.mascota === OTHER_PET
          ? { name: v.nombre_mascota.trim(), speciesKey: v.especie.trim() === OTHER_SPECIES ? null : v.especie.trim(), birthDate: v.fecha_nacimiento.trim() }
          : null,
      telefono: v.telefono.trim() === '' ? null : v.telefono.trim(),
      motivo: v.motivo,
    }));
};

export type CustomerDetails = z.output<ReturnType<typeof customerDetailsSchema>>;

/** Franja elegida en el paso 3 o en un cambio (campos ocultos o radios). */
export const slotChoiceSchema = z.object({
  fecha: str.pipe(z.string().trim().refine((v) => parseIsoDate(v) !== null, 'fecha')),
  profesional: str.pipe(z.string().trim().min(1).max(60)),
  hora: str.pipe(z.string().trim().refine(isHhmm, BOOKING_MESSAGES.hora)),
});

export const bookingStepSchema = slotChoiceSchema.extend({ servicio: str.pipe(z.string().trim().min(1).max(60)) });

/** Cancelar desde la cuenta: el id de la cita. */
export const cancelOwnSchema = z.object({ cita: str.pipe(z.string().trim().refine(isUuid, 'cita')) });

/** Cambiar desde la cuenta: la cita y la nueva franja. */
export const rescheduleOwnSchema = slotChoiceSchema.extend({ cita: str.pipe(z.string().trim().refine(isUuid, 'cita')) });

/** El correo se compara siempre normalizado (límite por invitado). */
export const normalizeContactEmail = normalizeEmail;
