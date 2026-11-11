import { redirect } from 'next/navigation';
import { cache } from 'react';
import { appointmentView } from '@/domain/appointment-view';
import { readOwnAppointment } from '@/db/queries/appointments';
import { getBookingConfig } from '@/db/queries/booking-config';
import { requireCustomer } from '@/lib/auth/require-customer';
import { getNow } from '@/lib/clock';
import { APPOINTMENT_NOT_FOUND_PATH } from './urls';

// Cita propia para las páginas de cancelar y cambiar: si no es del cliente, 404 (A9).
export const requireOwnAppointment = cache(async (id: string) => {
  const customer = await requireCustomer();
  const [appt, config, now] = await Promise.all([
    readOwnAppointment(customer.id, id),
    getBookingConfig(),
    getNow(),
  ]);
  if (!appt || !config) redirect(APPOINTMENT_NOT_FOUND_PATH);
  return { appt, config, now, view: appointmentView(appt, now, config.rules.changeCutoffHours) };
});
