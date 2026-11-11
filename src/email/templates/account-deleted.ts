import type { OutgoingEmail } from '../types';
import { buildAccountEmail, type AccountEmailContext, type AccountRecipient } from './account-layout';

// account_deleted (contracts/emails.md): confirmación del borrado. No hay enlace para recuperarla.
export function accountDeleted(ctx: AccountEmailContext, to: AccountRecipient): OutgoingEmail {
  return buildAccountEmail(ctx, to, `Hemos eliminado tu cuenta de ${ctx.clinicName}`, [
    { p: `Tal como pediste, hemos eliminado tu cuenta de ${ctx.clinicName}.` },
    { p: 'Hemos borrado tus datos personales y los de tus mascotas. Esta acción no se puede deshacer.' },
    { p: 'Si tenías citas pendientes, las hemos cancelado y la clínica ya lo sabe. Las anteriores ya no están ligadas a ti.' },
    { p: 'Si algún día quieres volver, puedes crear una cuenta nueva con este mismo correo.' },
  ]);
}
