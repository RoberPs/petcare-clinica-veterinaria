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

// appointment_confirmed (contracts/emails.md): variante de invitado (llamar para cancelar o cambiar)
// y de cliente ("Mis citas"). `hasAccount`: el correo de un invitado tiene cuenta; se sugiere iniciar
// sesión sin decirlo en pantalla (Q2).
export function appointmentConfirmed(
  ctx: EmailContext,
  d: AppointmentEmailData,
  options: { variant: Variant; cutoffHours: number; hasAccount?: boolean },
): OutgoingEmail {
  return buildAccountEmail(
    ctx,
    recipient(d),
    `Tu cita en ${ctx.clinicName} está confirmada`,
    [
      { p: 'Tu cita está confirmada. Estos son los datos:' },
      { rows: detailRows(ctx, d) },
      ...changeInstructions(ctx, options.variant, options.cutoffHours),
      ...(options.variant === 'guest' && options.hasAccount
        ? [{ p: 'La próxima vez, inicia sesión para ver tus citas en tu cuenta.' }]
        : []),
    ],
    { footer: clinicFooter(ctx) },
  );
}
