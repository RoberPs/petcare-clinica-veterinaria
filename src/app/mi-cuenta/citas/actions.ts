'use server';

import { redirect } from 'next/navigation';
import { sendEmailsNow } from '@/email/outbox';
import { actionContext } from '@/lib/account/action-context';
import { formRecord } from '@/lib/account/common';
import { requireCustomer } from '@/lib/auth/require-customer';
import { cancelOwn } from '@/lib/booking/cancel';
import { rescheduleOwn } from '@/lib/booking/reschedule';
import { APPOINTMENT_NOT_FOUND_PATH } from '@/lib/booking/urls';
import { withNotice } from '@/lib/notice';

// Server Actions de "Mis citas" (contracts/routes.md). Cada una vuelve a comprobar la sesión (A3)
// y termina en un 303 con ?aviso= (PRG). Una cita ajena o inexistente responde 404 (A9).

const LIST = '/mi-cuenta/citas';

const idFrom = (form: FormData) => {
  const v = form.get('cita');
  return typeof v === 'string' ? v.slice(0, 64) : '';
};

export async function cancelOwnAppointment(form: FormData): Promise<void> {
  const customer = await requireCustomer();
  const { now } = await actionContext();
  const result = await cancelOwn(customer.id, idFrom(form), { now });
  switch (result.status) {
    case 'ok':
      sendEmailsNow(result.emailIds);
      redirect(withNotice(LIST, 'cita-cancelada'));
    case 'out_of_window':
      redirect(withNotice(LIST, 'fuera-de-plazo'));
    case 'already_cancelled':
      redirect(withNotice(LIST, 'cita-no-disponible'));
    case 'not_found':
      redirect(APPOINTMENT_NOT_FOUND_PATH);
    default:
      redirect(withNotice(LIST, 'error-cita'));
  }
}

export async function rescheduleOwnAppointment(form: FormData): Promise<void> {
  const customer = await requireCustomer();
  const { now } = await actionContext();
  const id = idFrom(form);
  const raw = formRecord(form);
  const result = await rescheduleOwn(
    customer.id,
    id,
    { fecha: raw.fecha ?? '', profesional: raw.profesional ?? '', hora: raw.hora ?? '' },
    { now },
  );
  switch (result.status) {
    case 'ok':
      sendEmailsNow(result.emailIds);
      redirect(withNotice(LIST, 'cita-cambiada'));
    case 'slot_taken':
    case 'invalid': {
      // Vuelve al paso de fecha y hora con las horas libres actualizadas.
      const q = new URLSearchParams({ profesional: raw.profesional ?? '', fecha: raw.fecha ?? '' });
      redirect(withNotice(`${LIST}/${encodeURIComponent(id)}/cambiar?${q.toString()}`, 'hora-ocupada'));
    }
    case 'out_of_window':
      redirect(withNotice(LIST, 'fuera-de-plazo'));
    case 'already_cancelled':
      redirect(withNotice(LIST, 'cita-no-disponible'));
    case 'not_found':
      redirect(APPOINTMENT_NOT_FOUND_PATH);
    default:
      redirect(withNotice(LIST, 'error-cita'));
  }
}
