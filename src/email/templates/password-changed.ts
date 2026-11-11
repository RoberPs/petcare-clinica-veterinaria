import { formatDateTime } from '@/domain/time';
import type { OutgoingEmail } from '../types';
import { absoluteUrl, buildAccountEmail, type AccountEmailContext, type AccountRecipient } from './account-layout';

// password_changed (contracts/emails.md): tras restablecer o cambiar la contraseña. Aviso de
// seguridad, sin límite por hora.
export function passwordChanged(ctx: AccountEmailContext, to: AccountRecipient, at: Date): OutgoingEmail {
  return buildAccountEmail(ctx, to, `Tu contraseña de ${ctx.clinicName} ha cambiado`, [
    { p: `La contraseña de tu cuenta de ${ctx.clinicName} se cambió el ${formatDateTime(at)} (hora peninsular española).` },
    { p: 'Por seguridad, hemos cerrado la sesión en tus otros dispositivos.' },
    { p: 'Si no has sido tú, crea una contraseña nueva cuanto antes:' },
    { link: { label: 'Restablecer la contraseña', href: absoluteUrl(ctx, '/recuperar-contrasena') } },
  ]);
}
