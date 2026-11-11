import { describeWhen } from '@/domain/availability';
import type { EmailContext } from '../outbox';
import type { OutgoingEmail } from '../types';
import { buildAccountEmail } from './account-layout';
import {
  changeInstructions,
  clinicFooter,
  detailRows,
  recipient,
  type AppointmentEmailData,
  type Variant,
} from './appointment-common';

// appointment_changed (contracts/emails.md): la fecha y la hora anteriores y las nuevas, el
// profesional y las mismas instrucciones que la confirmación.
export function appointmentChanged(
  ctx: EmailContext,
  d: AppointmentEmailData,
  options: { previousStartsAt: Date; variant: Variant; cutoffHours: number },
): OutgoingEmail {
  const before = describeWhen(options.previousStartsAt);
  return buildAccountEmail(
    ctx,
    recipient(d),
    `Hemos cambiado tu cita en ${ctx.clinicName}`,
    [
      { p: `Tu cita del ${before.longDate} a las ${before.time} ha cambiado. Los nuevos datos son:` },
      { rows: detailRows(ctx, d) },
      ...changeInstructions(ctx, options.variant, options.cutoffHours),
    ],
    { footer: clinicFooter(ctx) },
  );
}
