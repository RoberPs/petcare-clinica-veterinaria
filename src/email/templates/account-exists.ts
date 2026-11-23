import type { OutgoingEmail } from '../types';
import { absoluteUrl, buildAccountEmail, type AccountEmailContext, type AccountRecipient } from './account-layout';

// account_exists (contracts/emails.md): alguien ha intentado registrarse con un correo ya verificado.
// La web responde igual que a un registro nuevo (A5); el aviso solo llega al dueño del correo.
export function accountExists(ctx: AccountEmailContext, to: AccountRecipient): OutgoingEmail {
  return buildAccountEmail(ctx, to, `Ya tienes una cuenta en ${ctx.clinicName}`, [
    { p: `Alguien ha intentado crear una cuenta en ${ctx.clinicName} con este correo, pero ya tienes una.` },
    { p: 'Si has sido tú, inicia sesión:' },
    { link: { label: 'Iniciar sesión', href: absoluteUrl(ctx, '/iniciar-sesion') } },
    { p: 'Si no recuerdas la contraseña, puedes crear una nueva:' },
    { link: { label: 'Recuperar la contraseña', href: absoluteUrl(ctx, '/recuperar-contrasena') } },
    { p: 'Si no has sido tú, ignora este correo: tu cuenta no ha cambiado.' },
  ]);
}
