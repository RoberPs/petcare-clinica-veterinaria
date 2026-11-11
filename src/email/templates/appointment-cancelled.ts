import type { EmailContext } from '../outbox';
import type { OutgoingEmail } from '../types';
import { absoluteUrl, buildAccountEmail } from './account-layout';
import { clinicFooter, detailRows, recipient, type AppointmentEmailData } from './appointment-common';

// appointment_cancelled (contracts/emails.md): al responsable. No se envía si cancela "system"
// (eliminación de la cuenta: ya recibe el correo de cuenta eliminada).
export function appointmentCancelled(
  ctx: EmailContext,
  d: AppointmentEmailData,
  options: { by: 'customer' | 'clinic' },
): OutgoingEmail {
  return buildAccountEmail(
    ctx,
    recipient(d),
    `Tu cita en ${ctx.clinicName} se ha cancelado`,
    [
      { p: options.by === 'clinic' ? 'La clínica ha cancelado esta cita:' : 'Has cancelado esta cita:' },
      { rows: detailRows(ctx, d) },
      {
        p:
          options.by === 'clinic'
            ? `Si tienes dudas, llámanos al ${ctx.clinicPhone}.`
            : 'Si quieres, puedes pedir otra cita cuando lo necesites.',
      },
      { link: { label: 'Pide cita', href: absoluteUrl(ctx, '/pide-cita') } },
    ],
    { footer: clinicFooter(ctx) },
  );
}
