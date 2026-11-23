'use server';

import { redirect } from 'next/navigation';
import { sendAccountEmailsNow } from '@/email/outbox';
import { actionContext } from '@/lib/account/action-context';
import { processDeleteAccount } from '@/lib/account/delete-account';
import type { FormState } from '@/lib/account/form-state';
import { requireCustomer } from '@/lib/auth/require-customer';
import { clearSessionCookie } from '@/lib/auth/session';

// Eliminar la cuenta (A12). Las sesiones ya se han borrado en cascada; aquí se borra la cookie.
export async function deleteAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const { result, outboxIds } = await processDeleteAccount(form, customer, await actionContext());
  sendAccountEmailsNow(outboxIds);
  if (result.status === 'ok') {
    await clearSessionCookie();
    redirect('/?aviso=cuenta-eliminada');
  }
  return result;
}
