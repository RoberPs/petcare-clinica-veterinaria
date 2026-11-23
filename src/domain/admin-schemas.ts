import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import { CLINIC_TZ } from './time';

// Esquemas Zod del panel de administración (contracts/routes.md). Los mensajes, en español.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "AAAA-MM-DD" que existe en el calendario. */
export const dateParam = z
  .string()
  .trim()
  .regex(ISO_DATE_RE, 'Escribe la fecha como AAAA-MM-DD.')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
  }, 'La fecha no existe.');

/** Vista de la agenda. */
export const weekParam = z.enum(['dia', 'semana']);

/** Slug de un veterinario. */
export const staffSlug = z.string().trim().regex(/^[a-z0-9-]{1,80}$/);

export const uuid = z.string().trim().regex(UUID_RE, 'Identificador no válido.');

/** manage_version de una cita. */
export const version = z.coerce.number().int().min(1);

/** "HH:MM" en múltiplos de 5 minutos. */
export const hhmm = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Escribe la hora como HH:MM.')
  .refine((v) => Number(v.slice(3, 5)) % 5 === 0, 'La hora debe ir en múltiplos de 5 minutos.');

/** Casilla de un formulario HTML: presente ("on", "1", "true") o ausente. */
export const checkbox = z
  .string()
  .nullish()
  .transform((v) => v === 'on' || v === '1' || v === 'true');

export type AdminFieldErrors = Record<string, string>;

/** Errores por campo de un ZodError (el primero de cada campo). */
export function adminFieldErrors(error: z.ZodError): AdminFieldErrors {
  const out: AdminFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ---------- Servicios, veterinarios y horario (US3, contracts/routes.md) ----------

const formInt = (min: number, max: number, message: string) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v), z.number({ error: message }).int(message).min(min, message).max(max, message));

/** Ids de casillas múltiples (FormData.getAll), sin repetir. */
const idList = z.array(uuid).transform((ids) => [...new Set(ids)]);

export const serviceForm = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2, 'El nombre tiene que tener entre 2 y 60 caracteres.').max(60, 'El nombre tiene que tener entre 2 y 60 caracteres.'),
  duration_minutes: formInt(5, 480, 'La duración tiene que ser de 5 a 480 minutos.').refine((n) => n % 5 === 0, 'La duración tiene que ser múltiplo de 5 minutos.'),
  active: checkbox,
  position: formInt(0, 999, 'El orden tiene que ser un número de 0 a 999.'),
  staff_ids: idList,
});
export type ServiceFormData = z.infer<typeof serviceForm>;

export const staffForm = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2, 'El nombre tiene que tener entre 2 y 80 caracteres.').max(80, 'El nombre tiene que tener entre 2 y 80 caracteres.'),
  bookable: checkbox,
  booking_position: formInt(0, 999, 'El orden tiene que ser un número de 0 a 999.'),
  service_ids: idList,
});
export type StaffFormData = z.infer<typeof staffForm>;

/** Nombre del campo de la rejilla semanal: d{día 1..7}_{tramo 0..2}_{opens|closes}. */
export const weekFieldName = (weekday: number, index: number, field: 'opens' | 'closes') => `d${weekday}_${index}_${field}`;

/** Rejilla semanal (7 días × 3 tramos) a partir del formulario. Los valores se validan en validateWeek. */
export function weekForm(get: (name: string) => string | null): { opens: string; closes: string }[][] {
  return Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 3 }, (_, i) => ({
      opens: (get(weekFieldName(d + 1, i, 'opens')) ?? '').slice(0, 10),
      closes: (get(weekFieldName(d + 1, i, 'closes')) ?? '').slice(0, 10),
    })),
  );
}

/** Lee un formulario (con campos múltiples) para un esquema del panel. */
export function formObject(form: FormData, multi: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== 'string') continue;
    if (multi.includes(k)) continue;
    out[k] = v;
  }
  for (const k of multi) out[k] = form.getAll(k).filter((v): v is string => typeof v === 'string');
  if (out.id === '') delete out.id;
  return out;
}
// ---------- Cancelar y mover una cita (US4, contracts/routes.md) ----------

export const CLINIC_NOTE_MAX = 300;

export const cancelForm = z.object({
  id: uuid,
  version,
  // Nota al cliente (FR-020): texto plano, sin saltos de línea múltiples.
  note: z
    .string()
    .optional()
    .transform((v) => (v ?? '').replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\n').trim())
    .refine((v) => v.length <= CLINIC_NOTE_MAX, `La nota tiene que tener como máximo ${CLINIC_NOTE_MAX} caracteres.`),
});
export type CancelFormData = z.infer<typeof cancelForm>;

export const moveForm = z.object({
  id: uuid,
  version,
  date: dateParam,
  time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Elige una hora.'),
  staff_id: uuid,
});
export type MoveFormData = z.infer<typeof moveForm>;
// ---------- Bloqueos (US5, F8, F10, contracts/routes.md) ----------

export const BLOCK_REASON_MAX = 120;
export const BLOCK_MAX_DAYS = 366;

/** Campos del formulario del bloqueo (los mismos en el GET de revisión y en el POST). */
export const BLOCK_FIELDS = [
  'id',
  'scope',
  'staff_id',
  'kind',
  'start_date',
  'start_time',
  'end_date',
  'end_time',
  'from_date',
  'until_date',
  'weekdays',
  'weekly_start',
  'weekly_end',
  'reason',
] as const;

export type BlockDraft =
  | { teamMemberId: string | null; kind: 'once'; startsAt: Date; endsAt: Date; reason: string }
  | {
      teamMemberId: string | null;
      kind: 'weekly';
      fromDate: string;
      untilDate: string;
      weekdays: number[];
      startTime: string;
      endTime: string;
      reason: string;
    };

type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const many = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function zoned(date: string, time: string): Date {
  return new Date(
    Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(CLINIC_TZ, { disambiguation: 'compatible' }).epochMilliseconds,
  );
}

/**
 * Valida el formulario de un bloqueo y lo convierte en instantes (Europe/Madrid). Errores por campo
 * en español (FR-026, FR-027, US5 escenario 6). Sin JavaScript se envían los campos de los dos
 * tipos: se ignoran los del tipo no elegido.
 */
export function parseBlockForm(raw: RawParams, now: Date): { ok: true; draft: BlockDraft } | { ok: false; errors: AdminFieldErrors } {
  const errors: AdminFieldErrors = {};
  const scope = one(raw.scope);
  const kind = one(raw.kind);
  const reason = one(raw.reason).trim();
  let teamMemberId: string | null = null;
  if (scope === 'staff') {
    const s = uuid.safeParse(one(raw.staff_id));
    if (s.success) teamMemberId = s.data;
    else errors.staff_id = 'Elige el veterinario.';
  } else if (scope !== 'clinic') errors.scope = 'Elige si bloqueas a un veterinario o a toda la clínica.';
  if (kind !== 'once' && kind !== 'weekly') errors.kind = 'Elige si el bloqueo es puntual o se repite cada semana.';
  if (reason.length < 1 || reason.length > BLOCK_REASON_MAX) errors.reason = `Escribe un motivo de 1 a ${BLOCK_REASON_MAX} caracteres.`;
  const today = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(CLINIC_TZ).toPlainDate();

  const date = (field: string) => {
    if (one(raw[field]).trim() === '') {
      errors[field] = 'Elige la fecha.';
      return null;
    }
    const r = dateParam.safeParse(one(raw[field]));
    if (!r.success) errors[field] = r.error.issues[0]!.message;
    return r.success ? r.data : null;
  };
  const time = (field: string) => {
    if (one(raw[field]).trim() === '') {
      errors[field] = 'Elige la hora.';
      return null;
    }
    const r = hhmm.safeParse(one(raw[field]));
    if (!r.success) errors[field] = r.error.issues[0]!.message;
    return r.success ? r.data : null;
  };

  if (kind === 'once') {
    const sd = date('start_date');
    const st = time('start_time');
    const ed = date('end_date');
    const et = time('end_time');
    if (sd && st && ed && et) {
      const startsAt = zoned(sd, st);
      const endsAt = zoned(ed, et);
      if (endsAt.getTime() <= startsAt.getTime()) errors.end_time = 'El fin tiene que ser posterior al inicio.';
      else if (endsAt.getTime() <= now.getTime()) errors.end_date = 'El bloqueo termina en el pasado.';
      else if (Temporal.PlainDate.from(sd).until(Temporal.PlainDate.from(ed)).days > BLOCK_MAX_DAYS)
        errors.end_date = `Un bloqueo puede durar como máximo ${BLOCK_MAX_DAYS} días.`;
      if (Object.keys(errors).length === 0) return { ok: true, draft: { teamMemberId, kind: 'once', startsAt, endsAt, reason } };
    }
  } else if (kind === 'weekly') {
    const from = date('from_date');
    const until = date('until_date');
    const st = time('weekly_start');
    const et = time('weekly_end');
    const weekdays = [...new Set(many(raw.weekdays).map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort();
    if (weekdays.length === 0) errors.weekdays = 'Elige al menos un día de la semana.';
    if (from && until) {
      const span = Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(until)).days;
      if (span < 0) errors.until_date = 'La fecha final tiene que ser igual o posterior a la inicial.';
      else if (span > BLOCK_MAX_DAYS) errors.until_date = `Un bloqueo semanal puede durar como máximo ${BLOCK_MAX_DAYS} días.`;
      else if (Temporal.PlainDate.compare(Temporal.PlainDate.from(until), today) < 0) errors.until_date = 'El bloqueo termina en el pasado.';
    }
    if (st && et && et <= st) errors.weekly_end = 'La hora de fin tiene que ser posterior a la de inicio.';
    if (Object.keys(errors).length === 0 && from && until && st && et) {
      return { ok: true, draft: { teamMemberId, kind: 'weekly', fromDate: from, untilDate: until, weekdays, startTime: st, endTime: et, reason } };
    }
  }
  return { ok: false, errors: Object.keys(errors).length ? errors : { kind: 'Revisa los datos del bloqueo.' } };
}

export const blockDecision = z.enum(['keep', 'cancel_all']);