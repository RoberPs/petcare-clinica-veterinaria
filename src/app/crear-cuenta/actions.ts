'use server';

import { redirect } from 'next/navigation';
import { sendAccountEmailsNow } from '@/email/outbox';
import { actionContext } from '@/lib/account/action-context';
import type { FormState } from '@/lib/account/form-state';
import { processRegistration } from '@/lib/account/register';
import { processResendVerification } from '@/lib/account/verify';

// Server Actions del registro (contracts/forms.md). Next.js comprueba Origin frente al host (CSRF).
// Con y sin JavaScript, un envío correcto redirige con 303 (POST-Redirect-GET).

export async function register(_prev: FormState, form: FormData): Promise<FormState> {
  const { result, outboxIds } = await processRegistration(form, await actionContext());
  sendAccountEmailsNow(outboxIds);
  if (result.status === 'ok') redirect('/crear-cuenta/revisa-tu-correo');
  return result;
}

export async function resendVerification(_prev: FormState, form: FormData): Promise<FormState> {
  const { result, outboxIds } = await processResendVerification(form, await actionContext());
  sendAccountEmailsNow(outboxIds);
  if (result.status === 'ok') redirect('/crear-cuenta/revisa-tu-correo?aviso=enlace-reenviado');
  return result;
}

/** Reenvío desde el aviso "verifica tu correo" de iniciar sesión: formulario simple, sin estado. */
export async function resendVerificationFromLogin(form: FormData): Promise<void> {
  const { outboxIds } = await processResendVerification(form, await actionContext());
  sendAccountEmailsNow(outboxIds);
  redirect('/crear-cuenta/revisa-tu-correo?aviso=enlace-reenviado');
}
