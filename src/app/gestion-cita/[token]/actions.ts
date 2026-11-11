'use server';

import { redirect } from 'next/navigation';
import { sendEmailsNow } from '@/email/outbox';
import { actionContext } from '@/lib/account/action-context';
import { formRecord } from '@/lib/account/common';
import { clinicCancel, clinicReschedule } from '@/lib/booking/clinic-manage';
import { withNotice } from '@/lib/notice';

// Acciones del enlace de gestión de la clínica (contracts/routes.md). El token llega en un campo
// oculto; Next.js comprueba Origin frente al host (CSRF). Todo termina en un 303 (PRG).

const path = (token: string) => `/gestion-cita/${encodeURIComponent(token)}`;
const tokenFrom = (form: FormData) => {
  const v = form.get('token');
  return typeof v === 'string' ? v.slice(0, 400) : '';
};

export async function clinicCancelAppointment(form: FormData): Promise<void> {
  const token = tokenFrom(form);
  const { now } = await actionContext();
  const result = await clinicCancel(token, { now });
  if (result.status === 'ok') {
    sendEmailsNow(result.emailIds);
    redirect(withNotice(path(token), 'cita-cancelada'));
  }
  redirect(result.status === 'error' ? withNotice(path(token), 'error-cita') : path(token));
}

export async function clinicRescheduleAppointment(form: FormData): Promise<void> {
  const token = tokenFrom(form);
  const raw = formRecord(form);
  const { now } = await actionContext();
  const input = { fecha: raw.fecha ?? '', profesional: raw.profesional ?? '', hora: raw.hora ?? '' };
  const result = await clinicReschedule(token, input, { now });
  switch (result.status) {
    case 'ok':
      sendEmailsNow(result.emailIds);
      // El enlace anterior deja de valer: se sigue con el de la versión nueva.
      redirect(withNotice(path(result.token), 'cita-cambiada'));
    case 'slot_taken': {
      const q = new URLSearchParams({ profesional: input.profesional, fecha: input.fecha });
      redirect(withNotice(`${path(token)}/cambiar?${q.toString()}`, 'hora-ocupada'));
    }
    case 'error':
      redirect(withNotice(path(token), 'error-cita'));
    default:
      redirect(path(token));
  }
}
