'use server';

import { redirect } from 'next/navigation';
import { actionContext } from '@/lib/account/action-context';
import { processVerification } from '@/lib/account/verify';
import { setLoginHint } from '@/lib/auth/login-hint';

// "Confirmar mi correo" (A4): el token se gasta con este POST, nunca con el GET del enlace.
export async function verifyEmail(form: FormData): Promise<void> {
  const { now } = await actionContext();
  const result = await processVerification(form, { now });
  if (result.status === 'ok') {
    await setLoginHint(result.email, now);
    redirect('/iniciar-sesion?aviso=correo-verificado');
  }
  if (result.status === 'already_verified') redirect('/iniciar-sesion?aviso=correo-verificado');
  // Caducado, usado o con error: la misma página muestra el enlace caducado y el reenvío.
  redirect('/verificar-correo?estado=caducado');
}
