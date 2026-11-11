import type { OutgoingEmail } from '../types';
import { absoluteUrl, buildAccountEmail, type AccountEmailContext, type AccountRecipient } from './account-layout';

// verify_email (contracts/emails.md): registro nuevo, nuevo intento sobre una cuenta sin verificar o reenvío.
export function verifyEmail(ctx: AccountEmailContext, to: AccountRecipient, token: string): OutgoingEmail {
  const link = absoluteUrl(ctx, `/verificar-correo?token=${encodeURIComponent(token)}`);
  return buildAccountEmail(ctx, to, `Confirma tu correo en ${ctx.clinicName}`, [
    { p: `Gracias por crear tu cuenta en ${ctx.clinicName}. Para activarla, confirma que este correo es tuyo:` },
    { link: { label: 'Confirmar mi correo', href: link } },
    { p: 'El enlace caduca en 24 horas y solo se puede usar una vez.' },
    { p: 'Si no has sido tú, ignora este correo: la cuenta no se activará y se borrará en unos días.' },
  ]);
}
