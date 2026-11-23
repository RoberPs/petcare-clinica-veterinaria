'use server';

import { redirect } from 'next/navigation';
import { sendAccountEmailsNow } from '@/email/outbox';
import { actionContext } from '@/lib/account/action-context';
import type { FormState } from '@/lib/account/form-state';
import { processResetPassword } from '@/lib/account/password-reset';
import { clearSessionCookie } from '@/lib/auth/session';

// Nueva contraseña con el enlace (FR-019 a FR-021). Todas las sesiones se cierran, también la de
// este navegador si la había (FR-016): se vuelve a entrar con la contraseña nueva.
export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const { now } = await actionContext();
  const { result, outboxIds } = await processResetPassword(form, { now });
  sendAccountEmailsNow(outboxIds);
  if (result.status === 'ok') {
    await clearSessionCookie();
    redirect('/iniciar-sesion?aviso=contrasena-restablecida');
  }
  if (result.status === 'expired') redirect('/restablecer-contrasena?estado=caducado');
  return result;
}
