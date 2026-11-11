'use server';

import { redirect } from 'next/navigation';
import { sendAccountEmailsNow } from '@/email/account-outbox';
import { actionContext } from '@/lib/account/action-context';
import type { FormState } from '@/lib/account/form-state';
import { processChangePassword, processUpdateMarketing, processUpdateProfile } from '@/lib/account/profile';
import { requireCustomer } from '@/lib/auth/require-customer';

// Server Actions de "Datos personales". Cada una vuelve a comprobar la sesión (A3).

const PAGE = '/mi-cuenta/datos';

export async function updateProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const result = await processUpdateProfile(form, customer.id);
  if (result.status === 'ok') redirect(`${PAGE}?aviso=datos-guardados`);
  return result;
}

export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const { result, outboxIds } = await processChangePassword(form, customer, await actionContext());
  sendAccountEmailsNow(outboxIds);
  if (result.status === 'ok') redirect(`${PAGE}?aviso=contrasena-cambiada`);
  return result;
}

export async function updateMarketing(_prev: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const result = await processUpdateMarketing(form, customer.id);
  if (result.status === 'ok') redirect(`${PAGE}?aviso=datos-guardados`);
  return result;
}

