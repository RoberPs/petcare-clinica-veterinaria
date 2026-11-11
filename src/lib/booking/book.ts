import { eq } from 'drizzle-orm';
import { echoValues, validateForm, type FieldErrors, type FormValues } from '@/domain/account-schemas';
import { assignStaff } from '@/domain/assign-staff';
import {
  availableSlots,
  bookingWindow,
  parseIsoDate,
  type BookableService,
  type BookableStaff,
} from '@/domain/availability';
import {
  BOOKING_MESSAGES,
  customerDetailsSchema,
  guestDetailsSchema,
  type CustomerDetails,
  type GuestDetails,
  isHhmm,
  isValidPhone,
  NO_PREFERENCE,
  normalizeContactEmail,
  OTHER_PET,
} from '@/domain/booking-schemas';
import { getDb, type Tx } from '@/db/client';
import {
  busyIntervalsForDay,
  countActiveByCustomer,
  countActiveByEmail,
  dayLoad,
  findBySubmission,
  insertAppointment,
} from '@/db/queries/appointments';
import { loadBookingConfig, type BookingConfig } from '@/db/queries/booking-config';
import { findCustomerByEmail, lockCustomer } from '@/db/queries/customers';
import { countPets, getPet, insertPet } from '@/db/queries/pets';
import { recordHit } from '@/db/queries/rate-limit';
import { listSpecies } from '@/db/queries/species';
import { legalPages } from '@/db/schema';
import { getEmailContext } from '@/email/outbox';
import { checkPolicy, errorCode, formRecord, isHoneypotFilled, policyBucket } from '@/lib/account/common';
import { MAX_PETS } from '@/lib/account/pets';
import type { CurrentCustomer } from '@/lib/auth/session';
import { verifySubmissionToken } from '@/lib/form-token';
import { logger } from '@/lib/logger';
import { enqueueBookingEmails } from './emails';
import { withDayLocks } from './transaction';

// Confirmación de una cita (paso 3, contracts/forms.md). Orden: campo trampa → token → límite por
// origen → Zod → transacción con el bloqueo del día (B2): idempotencia, mascota propia, límite de
// citas activas, disponibilidad recalculada, asignación (B4), mascota nueva, cita, uso del límite y
// correos. En los logs solo van ids y códigos (FR-033).

export type BookingCustomer = Pick<CurrentCustomer, 'id' | 'email' | 'firstName' | 'lastName' | 'phone'>;

export interface BookContext {
  ip: string;
  /** Hora de negocio (getNow(): admite x-test-now en las pruebas). */
  now: Date;
  customer?: BookingCustomer | null;
  /**
   * Hora real para la antigüedad del token anti-robots (por defecto, new Date()). Es tiempo de reloj
   * transcurrido, no de negocio: con la hora de negocio fijada en las pruebas valdría siempre 0.
   */
  tokenNow?: Date;
}

export type BookResult =
  /** appointmentId null: campo trampa o envío demasiado rápido (éxito aparente, no se crea nada). */
  | { status: 'ok'; appointmentId: string | null; emailIds: string[]; created: boolean }
  | { status: 'invalid'; fieldErrors: FieldErrors; values: FormValues }
  | { status: 'slot_taken'; values: FormValues }
  | { status: 'rate_limited'; retryMinutes: number }
  | { status: 'limit_reached' }
  | { status: 'expired' }
  /** La mascota no es del cliente (o no existe). */
  | { status: 'not_found' }
  | { status: 'error' };

const NOTHING: BookResult = { status: 'ok', appointmentId: null, emailIds: [], created: false };
const PET_LIMIT_MESSAGE = `Ya tienes ${MAX_PETS} mascotas, el máximo por cuenta. Elige una de las guardadas.`;

/** Valores para volver a pintar el formulario: lo escrito, sin el token ni el campo trampa. */
export function bookingValues(raw: Record<string, string>): FormValues {
  const { submission: _s, web: _w, ...rest } = echoValues(raw);
  return rest;
}

/** El teléfono de la cuenta, si vale para la cita (9–20 caracteres de teléfono). */
export function accountPhone(customer: Pick<BookingCustomer, 'phone'>): string | null {
  return customer.phone && isValidPhone(customer.phone) ? customer.phone.trim() : null;
}

export interface SlotChoice {
  service: BookableService;
  /** null = "Sin preferencia". */
  staff: BookableStaff | null;
  date: string;
  time: string;
}

/** Servicio, profesional, fecha y hora de los campos ocultos o de los radios. */
export function resolveSlotChoice(
  raw: Record<string, string>,
  config: BookingConfig,
  now: Date,
  fixedService?: BookableService,
): { ok: true; choice: SlotChoice } | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  const service = fixedService ?? config.services.find((s) => s.slug === (raw.servicio ?? '').trim());
  if (!service) return { ok: false, fieldErrors: { servicio: BOOKING_MESSAGES.servicio } };
  const staffSlug = (raw.profesional ?? '').trim() || NO_PREFERENCE;
  let staff: BookableStaff | null = null;
  if (staffSlug !== NO_PREFERENCE) {
    staff = config.staff.find((m) => m.slug === staffSlug && service.staffIds.includes(m.id)) ?? null;
    if (!staff) errors.profesional = BOOKING_MESSAGES.profesional;
  }
  const { today, lastDay } = bookingWindow(now, config.rules);
  const date = parseIsoDate((raw.fecha ?? '').trim())?.toString();
  if (!date || date < today || date > lastDay) errors.fecha = BOOKING_MESSAGES.fecha(lastDay);
  const time = (raw.hora ?? '').trim();
  if (!isHhmm(time)) errors.hora = BOOKING_MESSAGES.hora;
  if (Object.keys(errors).length > 0 || !date) return { ok: false, fieldErrors: errors };
  // La hora tiene que estar en la cuadrícula del día (sin contar las citas: eso se mira dentro de la transacción).
  const grid = availableSlots({ ...config, date, service, staffId: staff?.id ?? null, busy: [], now });
  if (!grid.some((s) => s.time === time)) return { ok: false, fieldErrors: { hora: BOOKING_MESSAGES.hora } };
  return { ok: true, choice: { service, staff, date, time } };
}

type Details =
  | { kind: 'guest'; data: GuestDetails }
  | { kind: 'customer'; customer: BookingCustomer; data: CustomerDetails };

type TxOutcome =
  | { status: 'ok'; appointmentId: string; emailIds: string[]; created: boolean }
  | { status: 'slot_taken' }
  | { status: 'limit_reached' }
  | { status: 'not_found' }
  | { status: 'pet_limit' };

export async function bookAppointment(form: FormData, ctx: BookContext): Promise<BookResult> {
  const raw = formRecord(form);
  const values = bookingValues(raw);

  // 1. Campo trampa: éxito aparente sin guardar nada.
  if (isHoneypotFilled(form)) return NOTHING;

  // 2. Token firmado: idempotencia y tiempo mínimo de 3 s.
  const token = verifySubmissionToken(form.get('submission'), ctx.tokenNow ?? new Date());
  if (!token.ok) return token.reason === 'too_fast' ? NOTHING : { status: 'expired' };

  try {
    // 3. Límite por origen (B9).
    const bucket = policyBucket('booking_origin', ctx.ip);
    const retryMinutes = await checkPolicy('booking_origin', bucket, ctx.now);
    if (retryMinutes !== null) {
      logger.warn({ code: 'rate_limited' }, 'booking_rate_limited');
      return { status: 'rate_limited', retryMinutes };
    }

    // 4. Validación.
    const config = await loadBookingConfig();
    if (!config) return { status: 'error' };
    const speciesList = await listSpecies();
    const speciesKeys = speciesList.map((s) => s.key);
    const { today } = bookingWindow(ctx.now, config.rules);
    const slot = resolveSlotChoice(raw, config, ctx.now);
    const customer = ctx.customer ?? null;
    const phoneOnAccount = customer ? accountPhone(customer) : null;
    const validation = customer
      ? validateForm(customerDetailsSchema(speciesKeys, today, { phoneRequired: !phoneOnAccount }), raw)
      : validateForm(guestDetailsSchema(speciesKeys), raw);
    if (!slot.ok || !validation.ok) {
      return {
        status: 'invalid',
        fieldErrors: {
          ...(slot.ok ? {} : slot.fieldErrors),
          ...(validation.ok ? {} : validation.fieldErrors),
        },
        values,
      };
    }
    const details: Details = customer
      ? { kind: 'customer', customer, data: validation.data as CustomerDetails }
      : { kind: 'guest', data: validation.data as GuestDetails };
    const { service, staff, date, time } = slot.choice;
    const speciesLabel = (key: string | null) =>
      key ? (speciesList.find((s) => s.key === key)?.label ?? 'Otra') : 'Otra';
    const emailCtx = await getEmailContext();

    // 5. Transacción con el bloqueo del día.
    const outcome = await withDayLocks(getDb(), [date], async (tx: Tx): Promise<TxOutcome> => {
      const existing = await findBySubmission(tx, token.submissionId);
      if (existing) return { status: 'ok', appointmentId: existing.id, emailIds: [], created: false };

      let pet: { id: string | null; name: string; speciesLabel: string };
      let contact: { name: string; email: string; phone: string | null };
      if (details.kind === 'customer') {
        const { customer, data: d } = details;
        if (d.mascota !== OTHER_PET) {
          const own = await getPet(customer.id, d.mascota, tx);
          if (!own) return { status: 'not_found' };
          pet = { id: own.id, name: own.name, speciesLabel: own.speciesLabel ?? 'Otra' };
        } else {
          pet = { id: null, name: d.newPet!.name, speciesLabel: speciesLabel(d.newPet!.speciesKey) };
        }
        if ((await countActiveByCustomer(tx, customer.id, ctx.now)) >= config.rules.maxActivePerCustomer) {
          return { status: 'limit_reached' };
        }
        contact = {
          name: `${customer.firstName} ${customer.lastName}`.trim().slice(0, 100),
          email: customer.email,
          phone: phoneOnAccount ?? d.telefono,
        };
      } else {
        const d = details.data;
        if (
          (await countActiveByEmail(tx, normalizeContactEmail(d.correo), ctx.now)) >=
          config.rules.maxActivePerEmail
        ) {
          return { status: 'limit_reached' };
        }
        pet = { id: null, name: d.nombre_mascota, speciesLabel: speciesLabel(d.especie) };
        contact = { name: d.nombre, email: d.correo, phone: d.telefono };
      }

      // Disponibilidad recalculada bajo el bloqueo (B2).
      const busy = await busyIntervalsForDay(tx, date);
      const free = availableSlots({
        ...config,
        date,
        service,
        staffId: staff?.id ?? null,
        busy,
        now: ctx.now,
      }).find((s) => s.time === time);
      if (!free) return { status: 'slot_taken' };
      const teamMemberId =
        staff?.id ??
        assignStaff(
          free.freeStaffIds,
          await dayLoad(tx, date),
          config.staff.map((m) => m.id),
        );
      if (!teamMemberId) return { status: 'slot_taken' };

      // Mascota nueva del cliente, en la misma transacción (FR-011).
      if (details.kind === 'customer' && details.data.newPet) {
        const owner = details.customer.id;
        if (!(await lockCustomer(owner, tx))) return { status: 'not_found' };
        if ((await countPets(owner, tx)) >= MAX_PETS) return { status: 'pet_limit' };
        const np = details.data.newPet;
        pet.id = await insertPet(
          owner,
          { name: np.name, speciesKey: np.speciesKey, birthDate: np.birthDate },
          ctx.now,
          tx,
        );
      }

      const [privacy] = await tx
        .select({ version: legalPages.version })
        .from(legalPages)
        .where(eq(legalPages.kind, 'privacidad'))
        .limit(1);
      const { row, created } = await insertAppointment(tx, {
        submissionId: token.submissionId,
        bookingServiceId: service.id,
        teamMemberId,
        startsAt: free.startsAt,
        endsAt: free.endsAt,
        status: 'confirmed',
        bookedAs: customer ? 'customer' : 'guest',
        customerId: customer?.id ?? null,
        petId: pet.id,
        petName: pet.name,
        petSpeciesLabel: pet.speciesLabel,
        contactName: contact.name,
        contactEmail: contact.email,
        contactEmailNormalized: normalizeContactEmail(contact.email),
        contactPhone: contact.phone,
        reason: details.data.motivo,
        privacyAcceptedAt: ctx.now,
        privacyVersion: privacy?.version ?? 'desconocida',
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });
      if (!created) return { status: 'ok', appointmentId: row.id, emailIds: [], created: false };
      await recordHit(bucket, ctx.now, tx);
      // Q2: el invitado cuyo correo tiene cuenta recibe una línea más en el correo (no en pantalla).
      const hasAccount =
        !customer && (await findCustomerByEmail(normalizeContactEmail(contact.email), tx)) !== null;
      const emailIds = await enqueueBookingEmails(tx, row, emailCtx, {
        cutoffHours: config.rules.changeCutoffHours,
        hasAccount,
      });
      return { status: 'ok', appointmentId: row.id, emailIds, created: true };
    });

    switch (outcome.status) {
      case 'ok':
        logger.info(
          {
            appointment_id: outcome.appointmentId,
            created: outcome.created,
            booked_as: customer ? 'customer' : 'guest',
          },
          'appointment_booked',
        );
        return outcome;
      case 'slot_taken':
        logger.info({ code: 'slot_taken' }, 'appointment_slot_taken');
        return { status: 'slot_taken', values };
      case 'pet_limit':
        return { status: 'invalid', fieldErrors: { mascota: PET_LIMIT_MESSAGE }, values };
      default:
        logger.info({ code: outcome.status }, 'appointment_not_booked');
        return outcome;
    }
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'appointment_book_failed');
    return { status: 'error' };
  }
}
