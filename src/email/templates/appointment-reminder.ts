import { describeWhen } from '@/domain/availability';
import type { EmailContext } from '../outbox';
import type { OutgoingEmail } from '../types';
import { buildAccountEmail } from './account-layout';
import {
  changeInstructions,
  clinicFooter,
  detailRows,
  oneLine,
  recipient,
  type AppointmentEmailData,
  type Variant,
} from './appointment-common';

// appointment_reminder (contracts/emails.md, B17): los datos de la cita y las mismas instrucciones
// para cancelar o cambiar que la confirmación. Sin el motivo.
export function appointmentReminder(
  ctx: EmailContext,
  d: AppointmentEmailData,
  options: { variant: Variant; cutoffHours: number },
): OutgoingEmail {
  const when = describeWhen(d.startsAt);
  return buildAccountEmail(
    ctx,
    recipient(d),
    oneLine(`Recordatorio: tu cita en ${ctx.clinicName} es el ${when.longDate} a las ${when.time}`),
    [
      { p: 'Te recordamos tu próxima cita:' },
      { rows: detailRows(ctx, d) },
      ...changeInstructions(ctx, options.variant, options.cutoffHours),
    ],
    { footer: clinicFooter(ctx) },
  );
}
