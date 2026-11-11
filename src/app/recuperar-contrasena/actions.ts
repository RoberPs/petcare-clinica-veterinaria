'use server';

import { redirect } from 'next/navigation';
import { sendAccountEmailsNow } from '@/email/account-outbox';
import { actionContext } from '@/lib/account/action-context';
import type { FormState } from '@/lib/account/form-state';
import { processResetRequest } from '@/lib/account/password-reset';

// "¿Olvidaste tu contraseña?" (FR-018): siempre la misma página de "enviado".
export async function requestReset(_prev: FormState, form: FormData): Promise<FormState> {
  const { result, outboxIds } = await processResetRequest(form, await actionContext());
  sendAccountEmailsNow(outboxIds);
  if (result.status === 'ok') redirect('/recuperar-contrasena/enviado');
  return result;
}
