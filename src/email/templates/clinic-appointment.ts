import { describeWhen } from '@/domain/availability';
import type { EmailContext } from '../outbox';
import type { OutgoingEmail } from '../types';
import { buildAccountEmail, type Block } from './account-layout';
import { detailRows, oneLine, type AppointmentEmailData } from './appointment-common';

// clinic_appointment (contracts/emails.md): a la clínica, con todos los datos y el motivo. En
// "nueva" y "cambiada" lleva el enlace de gestión (B7); en "cancelada", quién la ha cancelado.

export type ClinicAction = 'new' | 'changed' | 'cancelled';

const ACTION_LABEL: Record<ClinicAction, string> = {
  new: 'nueva',
  changed: 'cambiada',
  cancelled: 'cancelada',
};
const ACTOR_LABEL = {
  customer: 'el cliente desde su cuenta',
  clinic: 'la clínica con el enlace de gestión',
  system: 'el sistema, al eliminar el cliente su cuenta',
} as const;

export interface ClinicAppointmentOptions {
  action: ClinicAction;
  /** URL absoluta de /gestion-cita/<token> (solo en "nueva" y "cambiada"). */
  manageUrl?: string;
  /** Inicio anterior (solo en "cambiada"). */
  previousStartsAt?: Date;
  cancelledBy?: keyof typeof ACTOR_LABEL;
}

export function clinicAppointment(
  ctx: EmailContext,
  d: AppointmentEmailData,
  o: ClinicAppointmentOptions,
): OutgoingEmail {
  const when = describeWhen(d.startsAt);
  const subject = oneLine(`Cita ${ACTION_LABEL[o.action]}: ${when.shortDate} ${when.time}, ${d.serviceName}`);
  const rows: [string, string][] = [
    ['Tipo', d.bookedAs === 'customer' ? 'Cliente con cuenta' : 'Invitado (sin cuenta)'],
    ['Responsable', d.contactName],
    ['Teléfono', d.contactPhone ?? 'no indicado'],
    ['Correo', d.contactEmail],
    ...detailRows(ctx, d).filter(([k]) => k !== 'Dirección'),
    ['Motivo', d.reason ?? 'no indicado'],
  ];
  const blocks: Block[] = [];
  if (o.action === 'changed' && o.previousStartsAt) {
    const before = describeWhen(o.previousStartsAt);
    blocks.push({ p: `La cita del ${before.longDate} a las ${before.time} ha cambiado a:` });
  }
  if (o.action === 'cancelled') {
    blocks.push({
      p: `Esta cita se ha cancelado. La ha cancelado ${ACTOR_LABEL[o.cancelledBy ?? 'customer']}. La hora queda libre.`,
    });
  }
  blocks.push({ rows });
  if (o.action !== 'cancelled' && o.manageUrl) {
    blocks.push({ link: { label: 'Gestionar esta cita (cancelar o cambiar)', href: o.manageUrl } });
    blocks.push({ p: 'Úsalo solo para atender a quien llame; no lo reenvíes.' });
  }
  return buildAccountEmail(ctx, { email: ctx.inboxEmail, firstName: ctx.clinicName }, subject, blocks, {
    greeting: null,
    replyTo: { email: d.contactEmail, name: d.contactName },
  });
}
