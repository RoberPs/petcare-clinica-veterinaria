'use server';

import { redirect } from 'next/navigation';
import { addDays } from '@/domain/time';
import { longDateLabel, parseIsoDate } from '@/domain/availability';
import { BOOKING_MESSAGES, NO_PREFERENCE } from '@/domain/booking-schemas';
import { loadBookingConfig } from '@/db/queries/booking-config';
import { sendEmailsNow } from '@/email/outbox';
import { actionContext } from '@/lib/account/action-context';
import { formRecord } from '@/lib/account/common';
import { getOptionalCustomer } from '@/lib/auth/require-customer';
import { bookAppointment, bookingValues } from '@/lib/booking/book';
import { signConfirmationRef } from '@/lib/booking/confirmation-ref';
import type { BookingFormState } from '@/lib/booking/form-state';
import { nextDateWithSlots, slotsForDay } from '@/lib/booking/slots';
import { bookingHref } from '@/lib/booking/urls';
import { createSubmissionToken } from '@/lib/form-token';

/**
 * Paso 3 (contracts/forms.md). Next.js comprueba Origin frente al host (CSRF). Un resultado
 * correcto redirige a la confirmación (PRG); una hora ocupada NO redirige: devuelve lo escrito y
 * las horas libres de esa fecha para elegir otra sin volver a escribir nada (B5).
 */
export async function confirmAppointment(_prev: BookingFormState, form: FormData): Promise<BookingFormState> {
  const { ip, now } = await actionContext();
  const customer = await getOptionalCustomer();
  const result = await bookAppointment(form, { ip, now, customer });
  const values = bookingValues(formRecord(form));
  const submitted = form.get('submission');
  const token = typeof submitted === 'string' && submitted.length <= 300 ? submitted : undefined;

  switch (result.status) {
    case 'ok': {
      sendEmailsNow(result.emailIds);
      redirect(
        result.appointmentId
          ? `/pide-cita/confirmada?ref=${encodeURIComponent(signConfirmationRef(result.appointmentId, now))}`
          : '/pide-cita/confirmada',
      );
    }
    case 'slot_taken':
      return slotTakenState(values, now, token);
    case 'not_found':
      // La mascota no es suya: el mismo error que una que no existe (A9).
      return { status: 'invalid', fieldErrors: { mascota: BOOKING_MESSAGES.mascota }, values, token };
    case 'expired':
      return { status: 'expired', token: createSubmissionToken(), values };
    case 'invalid':
      return { ...result, token };
    case 'rate_limited':
      return { status: 'rate_limited', retryMinutes: result.retryMinutes, values, token };
    case 'limit_reached':
      return { status: 'limit_reached', values, token };
    default:
      return { status: 'error', values, token };
  }
}

/** Horas libres de la fecha elegida, recalculadas, para volver a pintar el paso 3. */
async function slotTakenState(
  values: Record<string, string>,
  now: Date,
  token?: string,
): Promise<BookingFormState> {
  const config = await loadBookingConfig();
  const service = config?.services.find((s) => s.slug === values.servicio);
  const date = parseIsoDate(values.fecha ?? '')?.toString();
  if (!config || !service || !date) return { status: 'error', values, token };
  const staffSlug = values.profesional || NO_PREFERENCE;
  const staffId =
    staffSlug === NO_PREFERENCE ? null : (config.staff.find((m) => m.slug === staffSlug)?.id ?? null);
  const slots = await slotsForDay(config, { service, staffId, date, now });
  const next =
    slots.length === 0
      ? await nextDateWithSlots(config, { service, staffId, now, from: addDays(date, 1) })
      : null;
  const { hora: _hora, ...rest } = values;
  return {
    status: 'slot_taken',
    token,
    values: rest,
    date,
    dayLabel: longDateLabel(date),
    slots: slots.map((s) => ({ time: s.time })),
    nextHref: next
      ? bookingHref({ servicio: service.slug, profesional: staffSlug, fecha: next, mascota: values.mascota })
      : null,
    nextLabel: next ? longDateLabel(next) : null,
  };
}
