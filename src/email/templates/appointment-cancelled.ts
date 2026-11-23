import type { EmailContext } from '../outbox';
import type { OutgoingEmail } from '../types';
import { absoluteUrl, buildAccountEmail } from './account-layout';
import { clinicFooter, detailRows, oneLine, recipient, type AppointmentEmailData } from './appointment-common';

// appointment_cancelled (contracts/emails.md): al responsable. No se envía si cancela "system"
// (eliminación de la cuenta: ya recibe el correo de cuenta eliminada).
export function appointmentCancelled(
  ctx: EmailContext,
  d: AppointmentEmailData,
  options: { by: 'customer' | 'clinic'; byClinic?: boolean; clinicNote?: string | null },
): OutgoingEmail {
  // Feature 007: cancelada desde el panel, con la nota opcional en texto plano (se escapa al pintar).
  const note = options.byClinic && options.clinicNote?.trim() ? oneLine(options.clinicNote.trim()) : null;
  return buildAccountEmail(
    ctx,
    recipient(d),
    `Tu cita en ${ctx.clinicName} se ha cancelado`,
    [
      {
        p: options.byClinic
          ? 'La clínica ha cancelado tu cita:'
          : options.by === 'clinic'
            ? 'La clínica ha cancelado esta cita:'
            : 'Has cancelado esta cita:',
      },
      { rows: detailRows(ctx, d) },
      ...(note ? [{ rows: [['Mensaje de la clínica', note]] as [string, string][] }] : []),
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
