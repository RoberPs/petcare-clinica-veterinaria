import type { OutgoingEmail } from '../types';
import { absoluteUrl, buildAccountEmail, type AccountEmailContext, type AccountRecipient } from './account-layout';

// password_reset (contracts/emails.md): solo se envía si la cuenta existe.
export function passwordReset(ctx: AccountEmailContext, to: AccountRecipient, token: string): OutgoingEmail {
  const link = absoluteUrl(ctx, `/restablecer-contrasena?token=${encodeURIComponent(token)}`);
  return buildAccountEmail(ctx, to, `Restablece tu contraseña de ${ctx.clinicName}`, [
    { p: `Hemos recibido una petición para crear una contraseña nueva para tu cuenta de ${ctx.clinicName}.` },
    { link: { label: 'Crear una contraseña nueva', href: link } },
    { p: 'El enlace caduca en 1 hora y solo se puede usar una vez.' },
    { p: 'Si no lo has pedido, ignora este correo: tu contraseña no cambia.' },
  ]);
}
